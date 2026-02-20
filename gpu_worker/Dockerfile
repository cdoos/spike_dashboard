# =============================================================================
# GPU Worker — Cloud Run with NVIDIA L4 GPU
# =============================================================================
# Build from project root:
#   docker build -f gpu_worker/Dockerfile -t gpu-worker .
# Run:
#   docker run --gpus all -p 8080:8080 gpu-worker
# =============================================================================

FROM pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# System dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# Python dependencies (gpu_worker's own requirements)
COPY gpu_worker/requirements.txt .
RUN pip install --no-cache-dir --root-user-action=ignore -r requirements.txt

# Copy torchbci from project root and install
COPY torchbci/ ./torchbci/
RUN pip install --no-cache-dir --root-user-action=ignore -e ./torchbci

# Copy worker application
COPY gpu_worker/app.py .

# Cloud Run uses PORT env variable (default 8080)
ENV PORT=8080
EXPOSE 8080

# Use gunicorn for production; single worker since GPU is shared
CMD exec gunicorn \
    --bind "0.0.0.0:${PORT}" \
    --timeout 3600 \
    --workers 1 \
    --threads 2 \
    app:app
