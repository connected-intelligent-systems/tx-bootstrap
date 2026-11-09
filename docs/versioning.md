# Versioning and releases

All repository-owned packages, container images, Compose artifacts, and Helm
charts share the semantic version in [`VERSION`](../VERSION). External
components keep their upstream versions.

## Choose a build

| Build       | Version format           | Use                              |
| ----------- | ------------------------ | -------------------------------- |
| Release     | `0.3.0`                  | A published, fixed stack version |
| Development | `0.3.0-dev.sha.<commit>` | A specific build from `main`     |
| Local       | `local`                  | Images built from your checkout  |

Prefer an explicit release, development version, or digest for repeatable
deployments. Floating aliases such as `latest` can change.

## Prepare a release

From the repository root, set the next version and validate it. For example,
to prepare a patch after `0.3.0`:

```sh
npm run version:set -- 0.3.1
npm run version:check
```

Commit all files changed by `version:set` through a pull request. The command
synchronizes package metadata, lock files, charts, and image references.
Use patch versions for compatible fixes, minor versions for features, and
major versions for breaking changes. Before `1.0.0`, a minor release may carry
a documented breaking change.

After the version update is merged, tag the intended release commit using the
version recorded in that checkout:

```sh
git tag "v$(cat VERSION)"
git push origin "v$(cat VERSION)"
```

CI checks that the tag and metadata agree, publishes application images and
Compose artifacts, then publishes the matching Helm charts. Pushes to `main`
also publish immutable development builds. See the
[release workflow](../.github/workflows/release.yml) for the publication steps.

## Release notes

- [0.3.0](releases/0.3.0.md) — Optional participant tunnels and documentation site
- [0.2.1](releases/0.2.1.md) — S3 secret references in the portal
- [0.2.0](releases/0.2.0.md) — S3 HTTP-pull and Compose network changes
