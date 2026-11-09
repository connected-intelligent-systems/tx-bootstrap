import os
import sys

import pytest

# Linux (CI, containers) exercises the real seccomp network sandbox. Other
# platforms cannot install it, so local runs there fall back to best-effort.
SPARQL_SANDBOX = "required" if sys.platform == "linux" else "best-effort"
os.environ.setdefault("SPARQL_NETWORK_SANDBOX", SPARQL_SANDBOX)


@pytest.fixture
def sparql_sandbox() -> str:
    return SPARQL_SANDBOX
