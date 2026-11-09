"""Isolated SPARQL execution.

User-supplied SPARQL runs in a short-lived child process that opens a frozen,
read-only checkpoint of the catalog. This gives two guarantees the API process
cannot provide on its own:

* A query that exceeds its time budget is killed. Oxigraph evaluation cannot be
  cancelled from Python, so a thread would keep running (and consuming CPU)
  after the HTTP request timed out.
* On Linux the child installs a seccomp filter that denies every non-Unix
  socket before evaluating the query. Oxigraph executes ``SERVICE`` clauses
  over HTTP, and SPARQL's ``<`` is ambiguous between an IRI and less-than, so
  a lexical filter can never prove that a query contains no ``SERVICE``. The
  filter makes such a clause fail instead of reaching the network.
"""

from __future__ import annotations

import csv
import ctypes
import io
import json
import multiprocessing
import platform
import struct
import sys
from multiprocessing.connection import Connection
from typing import Any

SANDBOX_REQUIRED = "required"
SANDBOX_BEST_EFFORT = "best-effort"


class QueryTimeoutError(Exception):
    pass


class QueryExecutionError(Exception):
    """The query could not be evaluated. ``client_error`` marks caller mistakes."""

    def __init__(self, message: str, *, client_error: bool) -> None:
        super().__init__(message)
        self.client_error = client_error


class SandboxUnavailableError(RuntimeError):
    pass


def run_query(
    *,
    snapshot_path: str,
    query: str,
    default_graphs: list[str],
    named_graphs: list[str],
    accept: str,
    max_results: int,
    max_bytes: int,
    timeout_seconds: float,
    sandbox: str = SANDBOX_REQUIRED,
) -> tuple[bytes, str]:
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(
        target=_child,
        args=(sender, snapshot_path, query, default_graphs, named_graphs, accept, max_results, max_bytes, sandbox),
        name="sparql-query",
        daemon=True,
    )
    process.start()
    sender.close()
    try:
        if not receiver.poll(timeout_seconds):
            raise QueryTimeoutError("SPARQL query timed out")
        try:
            message = receiver.recv()
        except EOFError as error:
            raise QueryExecutionError("SPARQL query process terminated unexpectedly", client_error=False) from error
    finally:
        if process.is_alive():
            process.kill()
        process.join()
        receiver.close()
    if message[0] == "ok":
        return message[1], message[2]
    _, client_error, text = message
    raise QueryExecutionError(text, client_error=client_error)


def _child(
    connection: Connection,
    snapshot_path: str,
    query: str,
    default_graphs: list[str],
    named_graphs: list[str],
    accept: str,
    max_results: int,
    max_bytes: int,
    sandbox: str,
) -> None:
    try:
        try:
            install_network_sandbox()
        except SandboxUnavailableError:
            if sandbox != SANDBOX_BEST_EFFORT:
                raise
        payload, media_type = execute(
            snapshot_path, query, default_graphs, named_graphs, accept, max_results, max_bytes
        )
        connection.send(("ok", payload, media_type))
    except (SyntaxError, ValueError) as error:
        connection.send(("error", True, str(error)[:1000]))
    except SandboxUnavailableError as error:
        connection.send(("error", False, str(error)))
    except Exception as error:  # noqa: BLE001 - reported to the parent without internals
        # OSError covers both an unreachable SERVICE endpoint and storage
        # failures; neither message is returned verbatim to API callers.
        connection.send(("error", False, f"SPARQL evaluation failed ({type(error).__name__})"))
    finally:
        connection.close()


def execute(
    snapshot_path: str,
    query: str,
    default_graphs: list[str],
    named_graphs: list[str],
    accept: str,
    max_results: int,
    max_bytes: int,
) -> tuple[bytes, str]:
    from pyoxigraph import NamedNode, QueryBoolean, QuerySolutions, QueryTriples, Store, serialize

    store = Store.read_only(snapshot_path)
    result = store.query(
        query,
        default_graph=[NamedNode(value) for value in default_graphs],
        named_graphs=[NamedNode(value) for value in named_graphs],
    )
    if isinstance(result, QueryBoolean):
        payload, content_type = _boolean_result(bool(result), accept)
    elif isinstance(result, QuerySolutions):
        payload, content_type = _solution_result(result, accept, max_results)
    elif isinstance(result, QueryTriples):
        triples = []
        for index, triple in enumerate(result):
            if index >= max_results:
                break
            triples.append(triple)
        rdf_format, content_type = _rdf_format(accept)
        graph_payload = serialize(triples, format=rdf_format)
        if graph_payload is None:
            raise ValueError("SPARQL graph serialization did not produce a response")
        payload = graph_payload
    else:
        raise ValueError("Unsupported SPARQL result type")
    if len(payload) > max_bytes:
        raise ValueError("SPARQL result exceeds configured response limit")
    return payload, content_type


def _boolean_result(value: bool, accept: str) -> tuple[bytes, str]:
    if "text/csv" in accept:
        return (b"boolean\r\ntrue\r\n" if value else b"boolean\r\nfalse\r\n"), "text/csv"
    if "text/tab-separated-values" in accept:
        return (b"?boolean\ntrue\n" if value else b"?boolean\nfalse\n"), "text/tab-separated-values"
    return json.dumps({"head": {}, "boolean": value}).encode(), "application/sparql-results+json"


def _solution_result(result: Any, accept: str, max_results: int) -> tuple[bytes, str]:
    variable_names = [variable.value for variable in result.variables]
    rows = []
    for index, solution in enumerate(result):
        if index >= max_results:
            break
        rows.append(solution)
    if "text/csv" in accept:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(variable_names)
        writer.writerows([[_term_value(solution[name]) for name in variable_names] for solution in rows])
        return buffer.getvalue().encode(), "text/csv"
    if "text/tab-separated-values" in accept:
        lines = ["\t".join("?" + name for name in variable_names)]
        lines.extend(
            "\t".join(str(solution[name]) if solution[name] is not None else "" for name in variable_names)
            for solution in rows
        )
        return ("\n".join(lines) + "\n").encode(), "text/tab-separated-values"
    bindings = []
    for solution in rows:
        binding = {}
        for name in variable_names:
            term = solution[name]
            if term is not None:
                binding[name] = _term_json(term)
        bindings.append(binding)
    return (
        json.dumps({"head": {"vars": variable_names}, "results": {"bindings": bindings}}).encode(),
        "application/sparql-results+json",
    )


def _term_value(term: Any) -> str:
    return getattr(term, "value", str(term)) if term is not None else ""


def _term_json(term: Any) -> dict[str, str]:
    class_name = type(term).__name__
    if class_name == "NamedNode":
        return {"type": "uri", "value": term.value}
    if class_name == "BlankNode":
        return {"type": "bnode", "value": term.value}
    result = {"type": "literal", "value": term.value}
    if getattr(term, "language", None):
        result["xml:lang"] = term.language
    elif getattr(term, "datatype", None):
        result["datatype"] = term.datatype.value
    return result


def _rdf_format(accept: str) -> tuple[Any, str]:
    from pyoxigraph import RdfFormat

    if "application/ld+json" in accept:
        return RdfFormat.JSON_LD, "application/ld+json"
    if "application/n-triples" in accept:
        return RdfFormat.N_TRIPLES, "application/n-triples"
    return RdfFormat.TURTLE, "text/turtle"


# --- seccomp network sandbox -------------------------------------------------

_PR_SET_NO_NEW_PRIVS = 38
_PR_SET_SECCOMP = 22
_SECCOMP_MODE_FILTER = 2
_SECCOMP_RET_KILL_PROCESS = 0x80000000
_SECCOMP_RET_ERRNO = 0x00050000
_SECCOMP_RET_ALLOW = 0x7FFF0000
_EPERM = 1
_AF_UNIX = 1
_X32_SYSCALL_BIT = 0x40000000

_BPF_LD_W_ABS = 0x20
_BPF_JEQ_K = 0x15
_BPF_JGE_K = 0x35
_BPF_RET_K = 0x06

# machine -> (AUDIT_ARCH, socket syscall nr, io_uring_setup syscall nr)
_ARCHITECTURES = {
    "x86_64": (0xC000003E, 41, 425),
    "aarch64": (0xC00000B7, 198, 425),
}


class _SockFilter(ctypes.Structure):
    _fields_ = [("code", ctypes.c_ushort), ("jt", ctypes.c_ubyte), ("jf", ctypes.c_ubyte), ("k", ctypes.c_uint)]


class _SockFprog(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.POINTER(_SockFilter))]


def _filter_program(audit_arch: int, socket_nr: int, io_uring_setup_nr: int) -> list[tuple[int, int, int, int]]:
    deny = _SECCOMP_RET_ERRNO | _EPERM
    # seccomp_data: nr @0, arch @4, instruction_pointer @8, args[0] low word @16 (little endian)
    return [
        (_BPF_LD_W_ABS, 0, 0, 4),
        (_BPF_JEQ_K, 1, 0, audit_arch),
        (_BPF_RET_K, 0, 0, _SECCOMP_RET_KILL_PROCESS),
        (_BPF_LD_W_ABS, 0, 0, 0),
        (_BPF_JGE_K, 0, 1, _X32_SYSCALL_BIT),
        (_BPF_RET_K, 0, 0, _SECCOMP_RET_KILL_PROCESS),
        # io_uring can create sockets without the socket(2) syscall.
        (_BPF_JEQ_K, 0, 1, io_uring_setup_nr),
        (_BPF_RET_K, 0, 0, deny),
        (_BPF_JEQ_K, 0, 3, socket_nr),
        (_BPF_LD_W_ABS, 0, 0, 16),
        (_BPF_JEQ_K, 1, 0, _AF_UNIX),
        (_BPF_RET_K, 0, 0, deny),
        (_BPF_RET_K, 0, 0, _SECCOMP_RET_ALLOW),
    ]


def install_network_sandbox() -> None:
    """Deny creation of any socket except AF_UNIX for the rest of this process."""
    if sys.platform != "linux":
        raise SandboxUnavailableError("SPARQL network sandbox requires Linux seccomp")
    arch = _ARCHITECTURES.get(platform.machine())
    if arch is None or struct.calcsize("P") != 8:
        raise SandboxUnavailableError(f"SPARQL network sandbox does not support {platform.machine()}")
    program = _filter_program(*arch)
    filters = (_SockFilter * len(program))(*(_SockFilter(*instruction) for instruction in program))
    fprog = _SockFprog(len(program), filters)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    if libc.prctl(_PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        raise SandboxUnavailableError(f"prctl(NO_NEW_PRIVS) failed with errno {ctypes.get_errno()}")
    if libc.prctl(_PR_SET_SECCOMP, _SECCOMP_MODE_FILTER, ctypes.addressof(fprog), 0, 0) != 0:
        raise SandboxUnavailableError(f"seccomp filter installation failed with errno {ctypes.get_errno()}")
