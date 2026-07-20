# Versioning and releases

tx-bootstrap uses one semantic version for every repository-owned component and
deployment artifact. [`VERSION`](../VERSION) is the source of truth. Package
metadata and Helm chart metadata are synchronized projections of that value.

The lockstep version covers:

- all `@tx-bootstrap/*` npm workspaces;
- the federated catalog Python package;
- the five repository-owned container images;
- the operator and participant Compose application artifacts; and
- the operator and participant Helm charts.

External images such as Tractus-X EDC, Identity Hub, BDRS, PostgreSQL, Vault,
and nginx keep their upstream versions. A tx-bootstrap release identifies the
tested combination of those dependencies; it does not relabel them.

## Changing the version

Set the next stable version from the repository root:

```sh
npm run version:set -- 0.1.3
npm run version:check
```

Commit every file changed by `version:set`. CI runs `version:check` and rejects
partially updated package, lock, chart, or first-party image metadata.

Use a patch increment for compatible fixes, a minor increment for compatible
features, and a major increment for breaking API, configuration, or deployment
changes. While the project remains below `1.0.0`, a minor increment may also
carry an explicitly documented breaking change.

## Development builds

A push to `main` derives one immutable prerelease identifier from `VERSION` and
the commit SHA:

```text
0.1.2-dev.sha.<commit>
```

CI applies that exact identifier to all published first-party images, Compose
applications, and Helm chart `version` and `appVersion` fields. The existing
`sha-<commit>`, `main`, and `latest` aliases may also be published, but they are
not the canonical stack version.

Local builds continue to use the explicit `local` tag. They are development
overrides rather than published stack releases.

## Stable releases

Create a stable release only after the version update has reached the target
commit:

```sh
git tag v0.1.2
git push origin v0.1.2
```

The release workflow first verifies that the tag, `VERSION`, every package,
both lock files, and both charts agree. It then publishes all first-party
images and Compose artifacts before publishing the matching Helm charts. Helm
defaults repository-owned image tags to the chart `appVersion`, while explicit
tags and immutable digests remain supported for deployment overrides.
