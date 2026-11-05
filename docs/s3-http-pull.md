# S3 sources over HTTP-pull

The optional data-plane image enables this route:

```text
S3-compatible object storage
  → provider data plane
  → authenticated HTTP-pull endpoint
  → consumer participant data proxy
```

The extension registers the S3 source with the runtime's existing EDR
authorization service. Token issuance, validation, refresh and streaming use
the existing runtime components. Storage credentials stay on the provider.
Initialization fails if the authorization service cannot issue EDRs.

## Select the image

The default deployment continues to use the stock image. To build and select
the optional image in the local Compose environment:

```sh
EDC_DATAPLANE_IMAGE=tx-bootstrap-edc-dataplane:local \
  deploy/local_compose/scripts/up.sh
```

The startup script builds this local tag automatically. For another Compose
deployment, build it explicitly and set `EDC_DATAPLANE_IMAGE` when rendering the
reusable participant application:

```sh
docker build -t tx-bootstrap-edc-dataplane:local apps/edc-dataplane
export EDC_DATAPLANE_IMAGE=tx-bootstrap-edc-dataplane:local
```

The public data route refreshes container DNS addresses so recreating the data
plane does not leave it pointing at the previous container IP.

A published deployment can select its versioned image through a service image
override. Release images follow the stack version under
`ghcr.io/<namespace>/tx-bootstrap-edc-dataplane:<stack-version>`; use the tag or
digest of a published build. The optional image pins its own base runtime to
`0.12.2`, independently of `TRACTUSX_EDC_TAG`. Its runtime is rebuilt from pinned,
checksum-verified source with patched serializer dependencies, and its OS
packages are upgraded during the image build.

For the participant chart, use the existing `dataPlane.image` values. For
example, with an image built locally and available to the cluster:

```yaml
dataPlane:
  image:
    repository: tx-bootstrap-edc-dataplane
    tag: local
    digest: ""
    pullPolicy: IfNotPresent
```

For a released image, set its full repository and version tag or digest.
Keep the image's inherited non-root user/group settings.

## Configure the provider source

Register an asset with a fixed private Data Address:

```json
{
  "type": "AmazonS3",
  "region": "us-east-1",
  "endpointOverride": "http://object-storage:9000",
  "bucketName": "shared-documents",
  "objectName": "tenant-a/application-a/documents/example/v1.txt",
  "keyName": "document-reader"
}
```

`objectName` selects the object. `keyName` references a provider-side secret;
it is not an object key. Grant that storage identity only the required read
permissions. The storage endpoint must be reachable from the provider data
plane. Use the endpoint and region appropriate to the deployment; plain HTTP
is intended for local environments.

In the provider's configured secret-store KV mount, provision the
`document-reader` alias. Its `content` field must contain a JSON **string**
with this typed credential structure:

```json
{
  "edctype": "dataspaceconnector:secrettoken",
  "accessKeyId": "EXAMPLE-ACCESS",
  "secretAccessKey": "EXAMPLE-SECRET",
  "expiration": 0
}
```

The `edctype` discriminator is required by the pinned runtime. Provision this
secret through the deployment's secret-management process. The participant
initialization job does not create storage credentials.

## Transfer mode and validation

The consumer negotiates the asset normally and requests
`transferType: "HttpData-PULL"`. The source uses S3; the consumer transport uses
HTTP. The consumer downloads through its scoped participant data proxy or the
negotiated endpoint using its EDR token.

Only S3 source → `HttpData-PULL` is validated. The registry also feeds runtime
capability advertisement, so an `AmazonS3-PULL` capability may appear; that route
is not validated. Direct storage credential delivery, presigned URLs and other
transfer combinations are outside this extension's tested scope.

The image build checks service discovery, existing HTTP-pull behavior, S3 EDR
delegation, issuance failures, revocation and incompatible-runtime handling.
An end-to-end deployment check should additionally verify the document bytes
and checksum, storage permission boundaries, token enforcement, absence of
storage credentials in public metadata/EDRs, and download after EDR refresh.

The image is a version-specific compatibility extension. Revalidate those
checks when updating the base runtime and remove the extension when equivalent
upstream support is verified.
