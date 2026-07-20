{{/* Chart name. */}}
{{- define "tx-bootstrap-operator.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Release-qualified name. */}}
{{- define "tx-bootstrap-operator.fullname" -}}
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

{{/* Component resource name. Input: root and component. */}}
{{- define "tx-bootstrap-operator.componentName" -}}
{{- $baseLength := sub 62 (len .component) | int -}}
{{- $base := include "tx-bootstrap-operator.fullname" .root | trunc $baseLength | trimSuffix "-" -}}
{{- printf "%s-%s" $base .component | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "tx-bootstrap-operator.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "tx-bootstrap-operator.labels" -}}
helm.sh/chart: {{ include "tx-bootstrap-operator.chart" . }}
app.kubernetes.io/name: {{ include "tx-bootstrap-operator.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: tx-bootstrap-operator
{{- end }}

{{/* Selector labels. Input: root and component. */}}
{{- define "tx-bootstrap-operator.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tx-bootstrap-operator.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "tx-bootstrap-operator.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "tx-bootstrap-operator.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "tx-bootstrap-operator.issuerDid" -}}
{{- printf "did:web:%s:%s" .Values.identity.issuerDidHost .Values.identity.issuerBpn }}
{{- end }}

{{/* Render an image by immutable digest when supplied, otherwise by tag. */}}
{{- define "tx-bootstrap-operator.image" -}}
{{- if .image.digest -}}
{{- printf "%s@%s" .image.repository .image.digest -}}
{{- else -}}
{{- printf "%s:%s" .image.repository (default .root.Chart.AppVersion .image.tag) -}}
{{- end -}}
{{- end }}

{{/* Merge chart-wide restrictions with the image-specific numeric identity. */}}
{{- define "tx-bootstrap-operator.containerSecurityContext" -}}
{{- $context := deepCopy .root.Values.containerSecurityContext -}}
{{- $_ := mergeOverwrite $context .component -}}
{{- toYaml $context -}}
{{- end }}

{{- define "tx-bootstrap-operator.secretValue" -}}
valueFrom:
  secretKeyRef:
    name: {{ .root.Values.existingSecret.name }}
    key: {{ index .root.Values.existingSecret.keys .key }}
{{- end }}

{{- define "tx-bootstrap-operator.podDefaults" -}}
serviceAccountName: {{ include "tx-bootstrap-operator.serviceAccountName" . }}
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

{{/* Defaults for a pre-install hook using an account that already exists. */}}
{{- define "tx-bootstrap-operator.preInstallPodDefaults" -}}
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

{{- define "tx-bootstrap-operator.javaEnv" -}}
- name: JAVA_TOOL_OPTIONS
  value: {{ .Values.javaRuntime.javaToolOptions | quote }}
- name: OTEL_SDK_DISABLED
  value: {{ .Values.javaRuntime.otelSdkDisabled | quote }}
- name: OTEL_JAVAAGENT_ENABLED
  value: {{ .Values.javaRuntime.otelJavaagentEnabled | quote }}
{{- end }}

{{- define "tx-bootstrap-operator.vaultEnv" -}}
- name: EDC_VAULT_HASHICORP_URL
  value: {{ .Values.vault.url | quote }}
- name: EDC_VAULT_HASHICORP_TOKEN
  {{- include "tx-bootstrap-operator.secretValue" (dict "root" . "key" "vaultToken") | nindent 2 }}
- name: EDC_VAULT_HASHICORP_API_SECRET_PATH
  value: {{ .Values.vault.apiSecretPath | quote }}
{{- end }}

{{- define "tx-bootstrap-operator.deploymentMetadata" -}}
{{- $root := .root -}}
{{- $component := .component -}}
labels:
  {{- include "tx-bootstrap-operator.labels" $root | nindent 2 }}
  app.kubernetes.io/component: {{ $component }}
{{- with $root.Values.podAnnotations }}
annotations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}
