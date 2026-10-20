{{- define "mcpg.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/part-of: mcpg
{{- end -}}

{{- define "mcpg.selector" -}}
app.kubernetes.io/name: {{ . }}
{{- end -}}

{{- define "mcpg.shopHost" -}}shop.{{ .Values.domain }}{{- end -}}
{{- define "mcpg.appHost" -}}app.{{ .Values.domain }}{{- end -}}

{{- define "mcpg.shopUrl" -}}
{{ if .Values.ingress.tls }}https{{ else }}http{{ end }}://{{ include "mcpg.shopHost" . }}
{{- end -}}

{{/* our own images: prefix + name + tag */}}
{{- define "mcpg.image" -}}
{{ .root.Values.images.prefix }}{{ .name }}:{{ .root.Values.images.tag }}
{{- end -}}

{{/*
Reuse a value from an existing Secret so upgrades don't rotate passwords,
otherwise generate one. Usage:
  include "mcpg.secretValue" (dict "root" $ "secret" "mariadb-auth" "key" "root-password")
*/}}
{{- define "mcpg.secretValue" -}}
{{- $s := lookup "v1" "Secret" .root.Release.Namespace .secret -}}
{{- if and $s $s.data (hasKey $s.data .key) -}}
{{- index $s.data .key | b64dec -}}
{{- else -}}
{{- randAlphaNum (default 32 .len) -}}
{{- end -}}
{{- end -}}

{{- define "mcpg.storageClass" -}}
{{- if .Values.storageClass }}
storageClassName: {{ .Values.storageClass }}
{{- end }}
{{- end -}}

{{- define "mcpg.nodeSecurity" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "mcpg.containerSecurity" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end -}}

{{- define "mcpg.ingressTls" -}}
{{- if .root.Values.ingress.tls }}
tls:
  - hosts: [{{ .host | quote }}]
    secretName: {{ .secret }}
{{- end }}
{{- end -}}

{{- define "mcpg.ingressAnnotations" -}}
{{- if .Values.ingress.tls }}
annotations:
  cert-manager.io/cluster-issuer: {{ .Values.ingress.clusterIssuer }}
{{- end }}
{{- end -}}

{{- define "mcpg.mariadbSecret" -}}{{ default "mariadb-auth" .Values.mariadb.existingSecret }}{{- end -}}
{{- define "mcpg.wordpressSecret" -}}{{ default "wordpress-auth" .Values.wordpress.existingSecret }}{{- end -}}
{{- define "mcpg.postgresSecret" -}}{{ default "postgres-auth" .Values.postgres.existingSecret }}{{- end -}}
{{- define "mcpg.gatewaySecret" -}}{{ default "gateway-secrets" .Values.gateway.existingSecret }}{{- end -}}

{{/* env shared by the wordpress pod and the store-setup Job so both build the same wp-config */}}
{{- define "mcpg.wordpressEnv" -}}
- name: WORDPRESS_DB_HOST
  value: mariadb
- name: WORDPRESS_DB_NAME
  value: wordpress
- name: WORDPRESS_DB_USER
  value: wordpress
- name: WORDPRESS_DB_PASSWORD
  valueFrom: { secretKeyRef: { name: {{ include "mcpg.mariadbSecret" . }}, key: password } }
{{- range list "auth-key" "secure-auth-key" "logged-in-key" "nonce-key" "auth-salt" "secure-auth-salt" "logged-in-salt" "nonce-salt" }}
- name: WORDPRESS_{{ . | upper | replace "-" "_" }}
  valueFrom: { secretKeyRef: { name: {{ include "mcpg.wordpressSecret" $ }}, key: {{ . }} } }
{{- end }}
{{- end -}}
