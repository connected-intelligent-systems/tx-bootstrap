# Operator services

The operator manages participant onboarding and the services that establish
trust in the dataspace:

- **Operator console:** create participants, send invitations, and handle
  failed connector setup.
- **Onboarding service:** the public API used by participant portals.
- **Issuer Identity Hub and Issuer Service:** manage the operator's identity
  and issue participant credentials.
- **BDRS:** resolve participant business partner numbers (BPNs) to DIDs.

## Deploy

For a complete demo, follow [Local Compose](local-deployment.md). The local
console is at <http://localhost:39080>; the onboarding API is at
<http://localhost:39085/api>.

For a reusable deployment, provision PostgreSQL and Vault first, then configure
the [Compose application](../deploy/README.md) or
[operator Helm chart](../deploy/helm/operator/README.md).

## Onboard a participant

1. Create the participant in the operator console and confirm its assigned
   BPN and verification details.
2. Share the invitation token securely with the participant. If needed,
   select **Publish through the operator tunnel** to include tunnel settings.
3. The participant starts its connector and portal using the assigned BPN and
   invitation token.
4. Once the BPN is verified and connector endpoints have been submitted, the
   operator services prepare directory and issuer state automatically. The
   participant portal requests credentials from its own Identity Hub.
5. If setup fails, review the failed checks in the console, correct the
   endpoints or configuration, and retry.

The participant guide covers [the participant's steps](participant.md#onboarding).

An invitation can be rejected before connector setup is queued. Once setup
is queued, use **Revoke** instead: directory or issuer access may already
exist, including after a failed setup attempt. Rejection and the setup
worker's claim cannot take effect at the same time.

## Revoke a participant

Revocation permanently removes a participant from the dataspace. Open the
participant in the console, select **Revoke**, enter a reason and type the
participant's BPN to confirm. Scripts can call
`POST /api/admin/participants/{id}/revoke` with `{"reason", "confirmBpn"}`.

The console refuses while automatic connector setup is running for the
participant; revoke once it has finished. Otherwise it marks the participant
`REVOKED` and then:

1. **Blocks new credentials.** Participants request credentials from their
   own Identity Hub, and the issuer serves any registered holder. The Issuer
   Service cannot delete holders, so the console replaces the holder's DID
   with `did:web:revoked.invalid:<BPN>`; the original DID stays in the
   holder's `originalDid` property.
2. **Revokes every credential** issued to the participant's DID in the
   issuer's status list, including any it requested after onboarding. A
   request the issuer accepted just before step 1 can still produce a
   credential, so this step stays **in progress** while the issuer has
   running issuance for the participant and until a scan has run at least a
   minute after the revocation.
3. **Removes the BPN from BDRS** and from the public participant directory.
4. **Ends tunnel access**, if tunnels are enabled: the network reconciler
   revokes the participant's enrollment within 15 seconds. Without tunnels
   this step is **not applicable**.

The participant shows **Revocation in progress** until every step is done. The
console repeats unfinished steps every 30 seconds and records
**Revocation completed** in the participant's audit history. If a step fails,
the participant shows **Revocation incomplete**; the console keeps retrying,
and **Retry revocation** runs the steps immediately once the cause is fixed.

Other participants need no change. Their connectors reject the revoked
credentials once their status-list cache expires
(`edc.iam.credential.revocation.cache.validity`, 15 minutes by default).
Existing contract agreements remain, but new catalog, negotiation, and
transfer requests fail. A provider can terminate running transfers in its own
connector.

Keep the issuer's anonymous issuance disabled
(`edc.issuance.anonymous.allowed` unset or `false`); otherwise the issuer
accepts requests from unknown DIDs and step 1 has no effect.

### Readmit a participant

Revoked credentials stay revoked: the Issuer Service does not support
suspension. To let a revoked participant back in, select **Readmit** on its
revocation banner, enter a reason and confirm with the BPN. Scripts can call
`POST /api/admin/participants/{id}/readmit` with the same body as revoke.

The console restores the participant's BDRS entry and then its holder DID at
the issuer, and returns its onboarding case to **Ready for participant** with
a new credential request ID. Issuance reopens last: if the holder cannot be
restored, the BDRS entry is removed again. If readmission does not finish,
because a step fails, a response is lost or the console stops, the
participant stays revoked, the revocation steps run again to block access,
and readmission can be repeated.

The participant becomes verified only when its onboarding case and new
credential request are saved together. Revocation, readmission, and background
retries run one at a time for each participant; if another action is still
running, the console asks the operator to retry shortly.

The participant portal checks the operator once a minute after onboarding. It
shows the revocation, and once the case has a new credential request ID it
deletes the issuer's revoked credentials from its Identity Hub and requests
new ones. This also works if the portal was offline during revocation and
readmission. Verifiers reject any
presentation that still contains a revoked credential, so participants without
the portal must delete those credentials themselves before requesting new ones.
A participant that used the operator tunnel needs a new tunnel key.

## Public and administrative access

Expose the onboarding API and issuer gateway through HTTPS:

| Route                                        | Purpose                |
| -------------------------------------------- | ---------------------- |
| `/api/onboarding-cases*`                     | Participant onboarding |
| `/.well-known/did.json` and issuer DID paths | Identity resolution    |
| `/statuslist/*`                              | Credential status      |
| `/api/issuance/*`                            | Credential issuance    |
| `/api/directory/*`                           | BPN-to-DID lookup      |
| `/.well-known/api/*`                         | Service discovery      |

Keep the console, BDRS management, issuer administration, Vault, and PostgreSQL
on administrative networks. The console supports `api-key` authentication or
`forwarded-header` behind a trusted authentication proxy. API-key mode requires
`OPERATOR_CONSOLE_API_KEY`; the web console then asks for the key and keeps it
for the browser tab only, and scripts send it in the `x-api-key` header.
Forwarded-header mode requires the proxy to replace caller-supplied identity
headers.

The issuer's DID document advertises `https://<ISSUER_DID_HOST>/api/issuance`
as its credential service, which participants call to request credentials.
Set `ISSUER_ISSUANCE_URL` in Compose if the issuer is published under another
public URL.

The local demo uses loopback-only administrative ports with `network` auth
mode. Use authenticated access for non-local deployments.

Participant status and metadata updates require the invitation token in the
`x-participant-token` header. Keep it out of URLs and logs.

## Optional tunnel enrollment

The console can issue and revoke participant tunnel keys through an external
Headscale server. This feature is disabled by default. Setup, invitation
lifetimes, and the **Tunnel** tab are covered in
[Participant tunnel](participant-tunnel.md#operator).

For all Compose settings, see the
[operator manifest](../deploy/compose/operator.compose.yaml). For application
build and test commands, see [Development](development.md).
