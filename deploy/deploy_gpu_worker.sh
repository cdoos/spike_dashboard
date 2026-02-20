#!/usr/bin/env bash
# =============================================================================
# Deploy the GPU Worker to Cloud Run with NVIDIA L4 GPU
# =============================================================================
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated
#   2. Docker installed (or use Cloud Build)
#   3. A GCS bucket for data transfer
#   4. Cloud Run GPU quota enabled in your project
#
# Usage:
#   export GCP_PROJECT=my-project
#   export GCS_BUCKET=my-spike-data-bucket
#   bash deploy/deploy_gpu_worker.sh
#
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ID="${GCP_PROJECT:?Set GCP_PROJECT environment variable}"
REGION="${GCP_REGION:-europe-west1}"
SERVICE_NAME="${GPU_SERVICE_NAME:-spike-gpu-worker}"
GCS_BUCKET="${GCS_BUCKET:?Set GCS_BUCKET environment variable}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "=============================================="
echo " Spike Dashboard — GPU Worker Deployment"
echo "=============================================="
echo "  Project:  ${PROJECT_ID}"
echo "  Region:   ${REGION}"
echo "  Service:  ${SERVICE_NAME}"
echo "  Image:    ${IMAGE}"
echo "  Bucket:   ${GCS_BUCKET}"
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# Step 1: Build the Docker image
# ---------------------------------------------------------------------------
echo "[1/4] Building Docker image..."

# Build from project root so torchbci/ is in the Docker build context
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Option A: Build locally and push
docker build -f "${REPO_ROOT}/gpu_worker/Dockerfile" -t "${IMAGE}" "${REPO_ROOT}"

# Option B (alternative): Use Cloud Build — uncomment below if preferred
# gcloud builds submit "${REPO_ROOT}" --config=gpu_worker/cloudbuild.yaml --tag "${IMAGE}" --project "${PROJECT_ID}"

# ---------------------------------------------------------------------------
# Step 2: Push to Container Registry
# ---------------------------------------------------------------------------
echo "[2/4] Pushing image to Container Registry..."
docker push "${IMAGE}"

# ---------------------------------------------------------------------------
# Step 3: Create GCS bucket (if it doesn't exist)
# ---------------------------------------------------------------------------
echo "[3/4] Ensuring GCS bucket exists..."
gsutil ls -b "gs://${GCS_BUCKET}" 2>/dev/null || \
    gsutil mb -p "${PROJECT_ID}" -l "${REGION}" "gs://${GCS_BUCKET}"

# ---------------------------------------------------------------------------
# Step 4: Deploy to Cloud Run with GPU
# ---------------------------------------------------------------------------
echo "[4/4] Deploying to Cloud Run with L4 GPU..."

gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --platform managed \
    --execution-environment gen2 \
    --gpu 1 \
    --gpu-type nvidia-l4 \
    --cpu 8 \
    --memory 32Gi \
    --timeout 3600 \
    --min-instances 0 \
    --max-instances 1 \
    --no-allow-unauthenticated \
    --set-env-vars "TORCHBCI_PATH=/app/torchbci"

# ---------------------------------------------------------------------------
# Done — print the service URL
# ---------------------------------------------------------------------------
echo ""
echo "=============================================="
echo " Deployment complete!"
echo "=============================================="

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --format 'value(status.url)')

echo ""
echo "  GPU Worker URL: ${SERVICE_URL}"
echo ""
echo "  Set these in your dashboard's .env file:"
echo ""
echo "    GPU_EXECUTION_MODE=cloud_run"
echo "    GPU_WORKER_URL=${SERVICE_URL}"
echo "    GCS_BUCKET=${GCS_BUCKET}"
echo "    GCP_PROJECT=${PROJECT_ID}"
echo ""
echo "  Then restart the dashboard."
echo "=============================================="
