{{- define "tx-bootstrap-participant.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "tx-bootstrap-participant.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "tx-bootstrap-participant.componentName" -}}
{{- $baseLength := sub 62 (len .component) | int -}}
{{- $base := include "tx-bootstrap-participant.fullname" .root | trunc $baseLength | trimSuffix "-" -}}
{{- printf "%s-%s" $base .component | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "tx-bootstrap-participant.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "tx-bootstrap-participant.labels" -}}
helm.sh/chart: {{ include "tx-bootstrap-participant.chart" . }}
app.kubernetes.io/name: {{ include "tx-bootstrap-participant.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: tx-bootstrap-participant
{{- end }}

{{- define "tx-bootstrap-participant.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tx-bootstrap-participant.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "tx-bootstrap-participant.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "tx-bootstrap-participant.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "tx-bootstrap-participant.participantDid" -}}
{{- printf "did:web:%s:%s" .Values.identity.participantDidHost .Values.identity.participantBpn }}
{{- end }}

{{- define "tx-bootstrap-participant.issuerDid" -}}
{{- printf "did:web:%s:%s" .Values.identity.issuerDidHost .Values.identity.issuerBpn }}
{{- end }}

{{- define "tx-bootstrap-participant.dspCallbackAddress" -}}
{{- default (printf "https://%s/api/v1/dsp" .Values.identity.participantPublicHost) .Values.publicEndpoints.dspCallbackAddress }}
{{- end }}

{{- define "tx-bootstrap-participant.credentialServiceEndpoint" -}}
{{- default (printf "https://%s/api/credentials/v1/participants/%s" .Values.identity.participantPublicHost .Values.identity.participantBpnBase64) .Values.publicEndpoints.credentialServiceEndpoint }}
{{- end }}

{{- define "tx-bootstrap-participant.dataPlaneBaseUrl" -}}
{{- default (printf "https://%s/api/public/" .Values.identity.participantPublicHost) .Values.publicEndpoints.dataPlaneBaseUrl }}
{{- end }}

{{- define "tx-bootstrap-participant.dataPlaneTokenRefreshEndpoint" -}}
{{- default (printf "https://%s/api/public" .Values.identity.participantPublicHost) .Values.publicEndpoints.dataPlaneTokenRefreshEndpoint }}
{{- end }}

{{- define "tx-bootstrap-participant.participantInitHash" -}}
{{- printf "%s|%s|%s|%s|%s|%s" .Chart.Version (toJson .Values.identity) (toJson .Values.publicEndpoints) (toJson .Values.participantInit) (toJson .Values.vault) (toJson .Values.existingSecret) | sha256sum | trunc 8 -}}
{{- end }}

{{- define "tx-bootstrap-participant.participantInitMarkerAlias" -}}
{{- printf "tx-bootstrap-%s-init-%s" .Values.identity.participantRole (include "tx-bootstrap-participant.participantInitHash" .) -}}
{{- end }}

{{- define "tx-bootstrap-participant.image" -}}
{{- if .digest -}}
{{- printf "%s@%s" .repository .digest -}}
{{- else -}}
{{- printf "%s:%s" .repository .tag -}}
{{- end -}}
{{- end }}

{{/* Merge chart-wide restrictions with the image-specific numeric identity. */}}
{{- define "tx-bootstrap-participant.containerSecurityContext" -}}
{{- $context := deepCopy .root.Values.containerSecurityContext -}}
{{- $_ := mergeOverwrite $context .component -}}
{{- toYaml $context -}}
{{- end }}

{{- define "tx-bootstrap-participant.secretValue" -}}
valueFrom:
  secretKeyRef:
    name: {{ .root.Values.existingSecret.name }}
    key: {{ index .root.Values.existingSecret.keys .key }}
{{- end }}

{{- define "tx-bootstrap-participant.podDefaults" -}}
serviceAccountName: {{ include "tx-bootstrap-participant.serviceAccountName" . }}
automountServiceAccountToken: {{ .Values.serviceAccount.automountServiceAccountToken }}
securityContext:
  {{- toYaml .Values.podSecurityContext | nindent 2 }}
terminationGracePeriodSeconds: {{ .Values.terminationGracePeriodSeconds }}
{{- with .Values.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{- define "tx-bootstrap-participant.preInstallPodDefaults" -}}
{{- $root := .root -}}
serviceAccountName: {{ .serviceAccountName }}
automountServiceAccountToken: false
securityContext:
  {{- toYaml $root.Values.podSecurityContext | nindent 2 }}
terminationGracePeriodSeconds: {{ $root.Values.terminationGracePeriodSeconds }}
{{- with $root.Values.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $root.Values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $root.Values.affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $root.Values.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{- define "tx-bootstrap-participant.javaEnv" -}}
- name: JAVA_TOOL_OPTIONS
  value: {{ .Values.javaRuntime.javaToolOptions | quote }}
- name: OTEL_SDK_DISABLED
  value: {{ .Values.javaRuntime.otelSdkDisabled | quote }}
- name: OTEL_JAVAAGENT_ENABLED
  value: {{ .Values.javaRuntime.otelJavaagentEnabled | quote }}
{{- end }}

{{- define "tx-bootstrap-participant.vaultEnv" -}}
- name: EDC_VAULT_HASHICORP_URL
  value: {{ .Values.vault.url | quote }}
- name: EDC_VAULT_HASHICORP_TOKEN
  {{- include "tx-bootstrap-participant.secretValue" (dict "root" . "key" "vaultToken") | nindent 2 }}
- name: EDC_VAULT_HASHICORP_API_SECRET_PATH
  value: {{ .Values.vault.apiSecretPath | quote }}
{{- end }}
