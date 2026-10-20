#!/usr/bin/env bash
# Brings the whole platform up on a local k3d cluster, from nothing.
# Safe to run again: it reuses the cluster, rebuilds images and upgrades the release.
#   scripts/dev-up.sh            hosted LLM (put a key in later, see TODO-FOR-ME.md)
#   OLLAMA=1 scripts/dev-up.sh   chat uses the Ollama running on this laptop
#   ADMIN_EMAIL=asha@app.localhost scripts/dev-up.sh   seed admin email (first run only)
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER=mcpg
NS=mcpg
APPS=(woo-mcp notes-mcp gateway dashboard)

for tool in docker k3d kubectl helm; do
  command -v "$tool" >/dev/null || { echo "missing $tool, see README 'Local setup'"; exit 1; }
done
docker info >/dev/null 2>&1 || { echo "docker is not running"; exit 1; }

if ! k3d cluster list "$CLUSTER" >/dev/null 2>&1; then
  echo "creating k3d cluster $CLUSTER"
  k3d cluster create "$CLUSTER" -p "80:80@loadbalancer" -p "443:443@loadbalancer" --wait
fi
kubectl config use-context "k3d-$CLUSTER" >/dev/null

echo "building images"
images=()
for app in "${APPS[@]}"; do
  docker build -q -t "mcpg/$app:dev" -f "apps/$app/Dockerfile" . >/dev/null
  images+=("mcpg/$app:dev")
done
k3d image import -c "$CLUSTER" "${images[@]}" >/dev/null

# the seed admin password is made once and kept in .dev-admin (gitignored)
new_password=""
if [ ! -f .dev-admin ]; then
  new_password=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-16)
  printf '%s\n%s\n' "${ADMIN_EMAIL:-admin@app.localhost}" "$new_password" > .dev-admin
  chmod 600 .dev-admin
fi
admin_email=$(sed -n 1p .dev-admin)
admin_password=$(sed -n 2p .dev-admin)

extra=()
if [ "${OLLAMA:-}" = "1" ]; then
  extra=(-f charts/platform/values-local-ollama.yaml)
  kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl -n "$NS" get secret llm >/dev/null 2>&1 ||
    kubectl -n "$NS" create secret generic llm --from-literal=LLM_API_KEY=ollama >/dev/null
fi

# No --wait: Helm would wait for woo-mcp to be ready before running the
# store-setup hook, but woo-mcp is only ready once that hook has installed
# WooCommerce. Helm still waits for the hook Job; we wait for rollouts after.
echo "installing the chart (first run takes a few minutes: WordPress + WooCommerce setup)"
helm upgrade --install platform charts/platform -n "$NS" --create-namespace \
  -f charts/platform/values-local.yaml ${extra[@]+"${extra[@]}"} \
  --set gateway.seedAdminEmail="$admin_email" \
  --set gateway.seedAdminPassword="$admin_password" \
  --timeout 20m >/dev/null

# pick up freshly imported :dev images even when the chart itself did not change
kubectl -n "$NS" rollout restart deploy "${APPS[@]}" >/dev/null
for d in "${APPS[@]}" wordpress; do
  kubectl -n "$NS" rollout status deploy/"$d" --timeout=5m >/dev/null
done
kubectl -n "$NS" rollout status statefulset/mariadb --timeout=5m >/dev/null
kubectl -n "$NS" rollout status statefulset/postgres --timeout=5m >/dev/null

wp_password=$(kubectl -n "$NS" get secret wordpress-auth -o jsonpath='{.data.admin-password}' | base64 -d)

echo
echo "up and running"
echo "  store:      http://shop.localhost"
echo "  wp-admin:   http://shop.localhost/wp-admin   user admin, password $wp_password"
echo "  dashboard:  http://app.localhost"
echo "  mcp:        http://app.localhost/mcp"
echo "  seed admin: $admin_email"
if [ -n "$new_password" ]; then
  echo "  password:   $new_password   (shown once, also saved in .dev-admin)"
else
  echo "  password:   in .dev-admin"
fi
echo
echo "next: scripts/demo-check.sh"
