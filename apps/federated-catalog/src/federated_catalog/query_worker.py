"""Isolated SPARQL execution.

User-supplied SPARQL runs in a short-lived child process that opens a frozen,
read-only checkpoint of the catalog. A query that exceeds its time budget is
killed. Oxigraph evaluation cannot be cancelled from Python, so a thread would
keep running (and consuming CPU and the store lock) after the HTTP request
timed out.
"""

from __future__ import annotations

import csv
import io
import json
import multiprocessing
from multiprocessing.connection import Connection
from typing import Any


class QueryTimeoutError(Exception):
    pass


class QueryExecutionError(Exception):
    """The query could not be evaluated. ``client_error`` marks caller mistakes."""

    def __init__(self, message: str, *, client_error: bool) -> None:
        super().__init__(message)
        self.client_error = client_error


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
) -> tuple[bytes, str]:
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(
        target=_child,
        args=(sender, snapshot_path, query, default_graphs, named_graphs, accept, max_results, max_bytes),
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
) -> None:
    try:
        payload, media_type = execute(
            snapshot_path, query, default_graphs, named_graphs, accept, max_results, max_bytes
        )
        connection.send(("ok", payload, media_type))
    except (SyntaxError, ValueError) as error:
        connection.send(("error", True, str(error)[:1000]))
    except Exception as error:  # noqa: BLE001 - reported to the parent without internals
        # Internal failure details are not returned verbatim to API callers.
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
