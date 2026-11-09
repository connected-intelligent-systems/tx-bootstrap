# Documentation site

The documentation uses [MkDocs](https://www.mkdocs.org/) with the
[Material theme](https://squidfunk.github.io/mkdocs-material/). GitHub Pages is
configured to serve the site at
[connected-intelligent-systems.github.io/tx-bootstrap](https://connected-intelligent-systems.github.io/tx-bootstrap/).

## Preview locally

Use Python 3.12 or newer. From the repository root, create a separate virtual
environment for the pinned documentation tools:

```sh
python3 -m venv .venv-docs
source .venv-docs/bin/activate
python -m pip install -r requirements-docs.txt
python -m mkdocs serve
```

Open the URL printed by MkDocs. Changes to documentation and imported READMEs
rebuild the preview automatically. Stop the server with `Ctrl+C`.

## Build and validate

In the same virtual environment, run:

```sh
python -m mkdocs build --strict
```

The generated site is written to `site/`, which is ignored by Git. Strict
builds fail on warnings, including missing pages and broken document anchors.

## Edit the documentation

- Write documentation in Markdown under `docs/` and add pages to the `nav`
  section in `mkdocs.yml`.
- Edit deployment and application READMEs in their original locations. The
  hook in `scripts/docs_hooks.py` imports the selected READMEs during each
  build, so they have one source of truth.
- Use relative Markdown links to repository files. The hook keeps links to
  published guides within the site and sends links to source files or
  directories to GitHub. Code blocks are preserved.
- To publish another README, add its site path and source path to
  `IMPORTED_PAGES` in the hook, then add it to the navigation.
- Update `requirements-docs.txt` when upgrading MkDocs or the theme, and run
  a strict build before merging.

## GitHub Pages deployment

The `.github/workflows/docs.yml` workflow validates the documentation for pull
requests and pushes to `main`. After a successful build on `main`, it uploads
`site/` and deploys it through the official GitHub Pages actions. Pull requests
only build the site. The workflow can also be started manually from the
Actions tab; deployment runs only when the selected branch is `main`.

To activate hosting for this repository:

1. Merge or push the documentation setup to `main`.
2. Open **Settings → Pages → Build and deployment** and select **GitHub
   Actions** as the source.
3. Open **Actions → Documentation → Run workflow**, select `main`, and run
   the workflow if the initial deployment has already failed before Pages was
   enabled.

The deployment job uses the built-in `GITHUB_TOKEN` with `pages: write` and
`id-token: write`. No personal access token or `gh-pages` branch is needed.
The `github-pages` environment exposes the published URL in the workflow run.
See [GitHub's custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
for repository settings and deployment requirements.
