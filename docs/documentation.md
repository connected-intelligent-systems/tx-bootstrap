# Editing the documentation

The site uses [MkDocs](https://www.mkdocs.org/) with the
[Material theme](https://squidfunk.github.io/mkdocs-material/).

## Preview and build

From the repository root, use Python 3.12 or newer:

```sh
python3 -m venv .venv-docs
source .venv-docs/bin/activate
python -m pip install -r requirements-docs.txt
python -m mkdocs serve
```

Open the URL printed by MkDocs. The preview rebuilds when pages or imported
READMEs change. Stop it with `Ctrl+C`.

Before submitting changes, run:

```sh
python -m mkdocs build --strict
```

This checks navigation, document links, and anchors. Generated files go into
the ignored `site/` directory.

## Update pages

- Edit Markdown under `docs/` and add new pages to `nav` in `mkdocs.yml`.
- Edit deployment READMEs in their original directories. The site imports
  them automatically using `scripts/docs_hooks.py`.
- Use relative links to guides and repository files. Published guides link
  within the site; links to source files open on GitHub.
- Keep instructions focused on the task. Link to manifests and source code
  for the full configuration reference.

To import another README, add its source and destination to `IMPORTED_PAGES`
in the hook and add its destination to the site navigation. Restart the
preview after changing the hook.

## Publishing

Open a pull request for documentation changes. The **Documentation** workflow
runs a strict build; after merging to `main`, it deploys to
[GitHub Pages](https://connected-intelligent-systems.github.io/tx-bootstrap/).

For initial repository setup, select **GitHub Actions** under
**Settings → Pages → Build and deployment → Source**. The workflow can be
rerun from **Actions → Documentation**. Manual deployment runs also require
`main` as the selected branch. See
[GitHub's setup guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
for details.
