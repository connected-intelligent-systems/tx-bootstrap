# S3 HTTP-pull data-plane image

This optional image allows S3 sources to use authenticated HTTP-pull with the
existing transfer authorization and token refresh. It rebuilds the pinned
Tractus-X `0.12.2` runtime with the extension and dependency fixes.

Build from the repository root:

```sh
docker build -t tx-bootstrap-edc-dataplane:local apps/edc-dataplane
```

The build runs compatibility checks against the packaged runtime. CI publishes
the image with the stack's release and development versions. The runtime is
pinned in [Dockerfile](Dockerfile), independently of `TRACTUSX_EDC_TAG`.

See [S3 HTTP-pull](../../docs/s3-http-pull.md) for image selection, storage
credentials, and the supported transfer mode.
