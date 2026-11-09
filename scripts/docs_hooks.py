"""Publish repository READMEs and resolve their links without copying sources."""

import posixpath
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit

from markdown.extensions import Extension
from markdown.treeprocessors import Treeprocessor
from mkdocs.structure.files import File

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
IMPORTED_PAGES = {
    "deployment/index.md": "deploy/README.md",
    "deployment/database.md": "deploy/database/README.md",
    "deployment/local-kubernetes.md": "deploy/local_k8s/README.md",
    "deployment/helm/index.md": "deploy/helm/README.md",
    "deployment/helm/operator.md": "deploy/helm/operator/README.md",
    "deployment/helm/participant.md": "deploy/helm/participant/README.md",
    "applications/operator-console.md": "apps/operator-console/README.md",
    "applications/federated-catalog.md": "apps/federated-catalog/README.md",
    "applications/edc-dataplane.md": "apps/edc-dataplane/README.md",
    "applications/participant-api.md": "apps/participant-portal/server/src/openapi/README.md",
}


class RepositoryLinks(Treeprocessor):
    """Resolve links before MkDocs validates and renders relative URLs."""

    def run(self, root):
        for element in root.iter("a"):
            if "href" in element.attrib:
                element.set("href", self.resolve_link(element.get("href")))

    def resolve_link(self, url):
        link = urlsplit(url)
        if link.scheme or link.netloc or not link.path or link.path.startswith("/"):
            return url

        target = (LINKS.source.parent / unquote(link.path)).resolve()
        if target in LINKS.sources:
            destination = posixpath.relpath(
                LINKS.sources[target], posixpath.dirname(LINKS.page_uri)
            )
            return urlunsplit(("", "", quote(destination), link.query, link.fragment))

        if target.is_relative_to(REPOSITORY_ROOT) and target.exists():
            kind = "tree" if target.is_dir() else "blob"
            path = quote(target.relative_to(REPOSITORY_ROOT).as_posix())
            destination = f"{LINKS.repo_url}/{kind}/main/{path}"
            return urlunsplit((*urlsplit(destination)[:3], link.query, link.fragment))

        return url


class RepositoryLinksExtension(Extension):
    def extendMarkdown(self, md):
        # Inline and reference links are elements by this point; code is untouched.
        md.treeprocessors.register(RepositoryLinks(md), "repository_links", 5)


LINKS = RepositoryLinksExtension()


def on_config(config):
    config.markdown_extensions.append(LINKS)
    config.watch.extend(str(REPOSITORY_ROOT / path) for path in IMPORTED_PAGES.values())
    LINKS.repo_url = config.repo_url.rstrip("/")


def on_files(files, config):
    for destination, source in IMPORTED_PAGES.items():
        files.append(
            File.generated(
                config,
                destination,
                abs_src_path=str(REPOSITORY_ROOT / source),
            )
        )
    LINKS.sources = {
        Path(file.abs_src_path).resolve(): file.src_uri
        for file in files
        if file.abs_src_path
    }
    return files


def on_page_markdown(markdown, page, config, files):
    source = IMPORTED_PAGES.get(page.file.src_uri)
    LINKS.source = Path(page.file.abs_src_path)
    LINKS.page_uri = page.file.src_uri
    if source:
        page.edit_url = f"{LINKS.repo_url}/edit/main/{source}"
    return markdown
