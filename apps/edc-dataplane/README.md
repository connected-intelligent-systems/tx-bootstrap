# Optional S3 HTTP-pull data plane

This image adds a small extension to the pinned `0.12.2` base runtime. It lets
an S3 source use the existing authenticated HTTP-pull endpoint and EDR service.
The runtime is rebuilt from checksum-verified, commit-pinned source with patched
serializer dependencies. OS packages are upgraded, and the base image supplies
the instrumentation agent. The extension is loaded from a separate JAR through
the standard service-provider mechanism.

[dependency-security.init.gradle](dependency-security.init.gradle) pins the
serializer maintenance releases during the upstream build. The first build
downloads the source and build dependencies; subsequent builds reuse the
build cache.

Build from the repository root:

```sh
docker build -t tx-bootstrap-edc-dataplane:local apps/edc-dataplane
```

The build runs compatibility checks against the packaged runtime: SPI discovery,
S3 and existing HTTP issuance, failure propagation, revocation, and failure to
initialize when the authorization service cannot issue EDRs. The compiler and
test classes are excluded from the final image.

CI builds, scans and publishes `tx-bootstrap-edc-dataplane` with the stack's
release and development versions. The base runtime version remains pinned in
the Dockerfile; overriding a deployment's stock runtime tag does not change it.

See [S3 HTTP-pull configuration](../../docs/s3-http-pull.md) for deployment,
source addresses, secret formatting and the supported transfer mode.
