"""
GPU execution backend for offloading spike sorting to Cloud Run with L4 GPU.

When GPU_EXECUTION_MODE is 'cloud_run', algorithm execution is forwarded to
a Cloud Run service that has GPU access. When mode is 'local', algorithms
run in-process and this module is not used.

Architecture (cloud_run mode):
  Dashboard (CPU VM) ──HTTP POST──> Cloud Run GPU Service (L4, scale-to-zero)
                      <──HTTP────   (clustering results as JSON)

  Data transfer uses Google Cloud Storage as intermediate storage:
    1. Dashboard uploads input numpy array to GCS
    2. GPU worker downloads it, runs algorithm, uploads results to GCS
    3. Dashboard downloads results, cleans up temp GCS objects
"""

from __future__ import annotations

import io
import json
import logging
import time
from typing import Any, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)


class CloudRunGPUBackend:
    """Offload spike sorting algorithms to a Cloud Run service with L4 GPU.

    The worker service scales to zero when idle, so you only pay for GPU time
    while algorithms are actually running (~$0.80/hr for L4).
    Cold-start latency is typically 30-60 seconds.
    """

    def __init__(self, worker_url: str, gcs_bucket: str, gcp_project: str = ""):
        self.worker_url = worker_url.rstrip("/")
        self.gcs_bucket = gcs_bucket
        self.gcp_project = gcp_project
        self._gcs_client = None

        logger.info(
            "CloudRunGPUBackend initialized: worker=%s bucket=%s",
            self.worker_url,
            self.gcs_bucket,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_algorithm(
        self,
        algorithm: str,
        data: np.ndarray,
        params: Dict[str, Any],
        dataset_info: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Submit a spike sorting job to the Cloud Run GPU worker.

        Args:
            algorithm: 'jims' or 'kilosort4'
            data: Raw data array (channels x samples)
            params: Algorithm-specific parameters
            dataset_info: Optional metadata (probe_path, sampling_rate, etc.)

        Returns:
            Dict with at least 'clustering_results', 'num_clusters', 'num_spikes',
            'data_shape', and 'success'.
        """
        import requests

        job_id = f"spike-sort-{int(time.time() * 1000)}"

        # 1) Upload input data to GCS
        gcs_input = f"gpu-jobs/{job_id}/input.npy"
        logger.info(
            "Uploading data %s to gs://%s/%s", data.shape, self.gcs_bucket, gcs_input
        )
        self._upload_array(gcs_input, data)

        # 2) Call the GPU worker
        payload = {
            "job_id": job_id,
            "algorithm": algorithm,
            "params": params,
            "gcs_bucket": self.gcs_bucket,
            "gcs_input_path": gcs_input,
            "data_shape": list(data.shape),
            "data_dtype": str(data.dtype),
            "dataset_info": dataset_info or {},
        }

        logger.info("Submitting job %s to %s/run", job_id, self.worker_url)

        # Cloud Run cold-start with GPU can take ~60s; algorithm may run for minutes
        resp = requests.post(
            f"{self.worker_url}/run",
            json=payload,
            timeout=3600,
            headers=self._auth_headers(),
        )
        resp.raise_for_status()
        body = resp.json()

        if not body.get("success"):
            raise RuntimeError(body.get("error", "GPU worker returned failure"))

        # 3) Download clustering results from GCS
        gcs_results = body.get("gcs_results_path")
        if gcs_results:
            raw = self._download_bytes(gcs_results)
            body["clustering_results"] = json.loads(raw.decode("utf-8"))

        # 4) Clean up temporary GCS objects
        self._cleanup(f"gpu-jobs/{job_id}/")

        logger.info("Job %s complete: %d clusters", job_id, body.get("num_clusters", 0))
        return body

    # ------------------------------------------------------------------
    # GCS helpers
    # ------------------------------------------------------------------

    @property
    def _gcs(self):
        if self._gcs_client is None:
            from google.cloud import storage

            self._gcs_client = storage.Client(
                project=self.gcp_project if self.gcp_project else None
            )
        return self._gcs_client

    def _upload_array(self, path: str, arr: np.ndarray) -> None:
        bucket = self._gcs.bucket(self.gcs_bucket)
        blob = bucket.blob(path)
        buf = io.BytesIO()
        np.save(buf, arr)
        buf.seek(0)
        blob.upload_from_file(buf, content_type="application/octet-stream")

    def _download_bytes(self, path: str) -> bytes:
        bucket = self._gcs.bucket(self.gcs_bucket)
        return bucket.blob(path).download_as_bytes()

    def _cleanup(self, prefix: str) -> None:
        try:
            bucket = self._gcs.bucket(self.gcs_bucket)
            for blob in bucket.list_blobs(prefix=prefix):
                blob.delete()
        except Exception as exc:
            logger.warning("GCS cleanup for %s failed: %s", prefix, exc)

    # ------------------------------------------------------------------
    # Auth helpers
    # ------------------------------------------------------------------

    def _auth_headers(self) -> Dict[str, str]:
        """Return an ID-token Authorization header for authenticated Cloud Run."""
        try:
            import google.auth.transport.requests
            import google.oauth2.id_token

            auth_req = google.auth.transport.requests.Request()
            token = google.oauth2.id_token.fetch_id_token(auth_req, self.worker_url)
            return {"Authorization": f"Bearer {token}"}
        except Exception:
            # Service may allow unauthenticated invocations during development
            return {}


# ------------------------------------------------------------------
# Factory
# ------------------------------------------------------------------


def create_gpu_backend(config) -> Optional[CloudRunGPUBackend]:
    """
    Create a GPU backend based on configuration.

    Returns None for local execution (algorithms run in-process).
    Returns a CloudRunGPUBackend for cloud_run mode.
    """
    mode = getattr(config, "GPU_EXECUTION_MODE", "local")

    if mode == "local":
        logger.info("GPU execution mode: local (in-process)")
        return None

    if mode == "cloud_run":
        url = getattr(config, "GPU_WORKER_URL", "")
        bucket = getattr(config, "GCS_BUCKET", "")
        project = getattr(config, "GCP_PROJECT", "")
        if not url:
            raise ValueError("GPU_WORKER_URL is required when GPU_EXECUTION_MODE=cloud_run")
        if not bucket:
            raise ValueError("GCS_BUCKET is required when GPU_EXECUTION_MODE=cloud_run")
        return CloudRunGPUBackend(url, bucket, project)

    raise ValueError(f"Unknown GPU_EXECUTION_MODE: {mode!r}")
