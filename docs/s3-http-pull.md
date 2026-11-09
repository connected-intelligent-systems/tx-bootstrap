# S3 sources over HTTP-pull

The optional data-plane image lets a provider share objects from S3-compatible
storage through authenticated HTTP-pull. Storage credentials stay on the
provider; the consumer receives data through the negotiated transfer.

## Select the image

The default stack uses the stock data plane. To build and select the optional
image in the local Compose demo:

```sh
EDC_DATAPLANE_IMAGE=tx-bootstrap-edc-dataplane:local \
  deploy/local_compose/scripts/up.sh
```

For another deployment, use a published
`ghcr.io/connected-intelligent-systems/tx-bootstrap-edc-dataplane` image with
a stack version tag or digest. Set `EDC_DATAPLANE_IMAGE` in Compose or
`dataPlane.image` in the participant chart.

For a locally built image available to a Kubernetes cluster:

```yaml
dataPlane:
  image:
    repository: tx-bootstrap-edc-dataplane
    tag: local
    digest: ""
    pullPolicy: IfNotPresent
```

The optional image pins its runtime to `0.12.2`; changing `TRACTUSX_EDC_TAG`
does not change that base. See the [image README](../apps/edc-dataplane/README.md)
for manual builds.

## Configure the provider

In the portal, select **Amazon S3** and enter the bucket, object name, region,
and storage endpoint. To reuse a provider-side secret, enter its alias in
**Secret reference** and leave **Access Key ID** and **Secret Access Key** empty.
The reference is retained when editing the asset; the form does not create or
validate the referenced secret.

The equivalent asset data address is:

```json
{
  "type": "AmazonS3",
  "region": "us-east-1",
  "endpointOverride": "http://object-storage:9000",
  "bucketName": "shared-documents",
  "objectName": "documents/example.txt",
  "keyName": "document-reader"
}
```

`objectName` identifies the object; `keyName` identifies the secret alias.
The storage endpoint must be reachable from the provider data plane. Use
HTTPS outside local environments and limit the storage identity to the needed
objects.

Provision the alias in the provider's configured Vault KV mount. Its `content`
field must hold a JSON **string** containing:

```json
{
  "edctype": "dataspaceconnector:secrettoken",
  "accessKeyId": "EXAMPLE-ACCESS",
  "secretAccessKey": "EXAMPLE-SECRET",
  "expiration": 0
}
```

The `edctype` field is required by the pinned runtime. Provision this secret
through your deployment's secret manager; participant initialization does not
create storage credentials.

## Transfer

The consumer negotiates access normally and selects `HttpData-PULL`. Download
through the participant's [data proxy](participant.md#api-access), which handles
the transfer authorization and token refresh.

The supported path is **S3 source → HTTP-pull**. Other advertised transfer
combinations require separate validation. When changing the optional runtime,
verify object contents, storage permissions, authorization, and download after
token refresh in your deployment.
