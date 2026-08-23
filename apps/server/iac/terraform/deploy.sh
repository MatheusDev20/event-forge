#!/usr/bin/env bash
#########################################################
# Builds the Lambda bundle and applies the Terraform stack.
#
# There is no zip step: the lambda-wrapper module runs its own archive_file
# over `source_dir`, so Terraform wants the dist-lambda/ DIRECTORY, not a .zip.
#
# Usage:
#   ./deploy.sh              # plan + apply (asks for confirmation)
#   ./deploy.sh --plan       # plan only
#   ./deploy.sh --auto       # apply with no confirmation (used by CI)
#########################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

MODE="apply"
case "${1:-}" in
  --plan) MODE="plan" ;;
  --auto) MODE="auto" ;;
  "") ;;
  *) echo "❌ Unknown argument: $1 (expected --plan or --auto)"; exit 1 ;;
esac

#############################################
# ----------------- Build ------------------ #
# nest build (tsc) emits dist/ with decorator metadata intact; esbuild then
# bundles dist/lambda.js into a single dist-lambda/index.js.
#############################################

echo "📦 Building the Lambda bundle..."
cd "${SERVER_ROOT}"
rm -rf dist dist-lambda
pnpm run build:lambda

if [[ ! -f "${SERVER_ROOT}/dist-lambda/index.js" ]]; then
  echo "❌ Expected ${SERVER_ROOT}/dist-lambda/index.js — the build did not produce a bundle."
  exit 1
fi

#############################################
# --------------- Terraform ---------------- #
#############################################

cd "${SCRIPT_DIR}"

echo "🔧 terraform init..."
# State lives in S3 via a partial backend config — backend.hcl carries the
# bucket name and profile (see backend.hcl.example).
if [[ ! -f "${SCRIPT_DIR}/backend.hcl" ]]; then
  echo "❌ Missing ${SCRIPT_DIR}/backend.hcl"
  echo "   Create it from the template and fill in your state bucket:"
  echo "     cp backend.hcl.example backend.hcl"
  exit 1
fi

terraform init -input=false -backend-config=backend.hcl

# Tag the deploy with the current commit so it is identifiable in the console.
TF_VAR_service_version="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
export TF_VAR_service_version

case "${MODE}" in
  plan)
    terraform plan -input=false
    ;;
  auto)
    terraform apply -input=false -auto-approve
    ;;
  apply)
    terraform apply -input=false
    ;;
esac

if [[ "${MODE}" != "plan" ]]; then
  echo "✅ Deployed. Health check:"
  echo "   curl -s $(terraform output -raw function_url)health"
fi
