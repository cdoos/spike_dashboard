"""
GPU Worker Service — runs on Cloud Run with NVIDIA L4 GPU.

Receives spike sorting jobs over HTTP, executes them on GPU, and stores
results in Google Cloud Storage. Designed to scale to zero when idle.

Endpoints:
    GET  /health  — health check (reports CUDA status)
    POST /run     — execute a spike sorting algorithm

Expected request body for /run:
{
    "job_id":          "spike-sort-17...",
    "algorithm":       "jims" | "kilosort4",
    "params":          { ... algorithm parameters ... },
    "gcs_bucket":      "my-bucket",
    "gcs_input_path":  "gpu-jobs/<job_id>/input.npy",
    "data_shape":      [385, 900000],
    "data_dtype":      "float32",
    "dataset_info":    { "probe_path": "...", "sampling_rate": 30000 }
}
"""

from __future__ import annotations

import io
import json
import logging
import os
import shutil
import sys
import tempfile
from typing import Any, Dict, List

import numpy as np
from flask import Flask, jsonify, request

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gpu_worker")

# ---------------------------------------------------------------------------
# Add torchbci to sys.path (if bundled in the container)
# ---------------------------------------------------------------------------
TORCHBCI_PATH = os.environ.get("TORCHBCI_PATH", "/app/torchbci")
if os.path.isdir(TORCHBCI_PATH) and TORCHBCI_PATH not in sys.path:
    sys.path.insert(0, TORCHBCI_PATH)

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)


@app.route("/ping", methods=["GET"])
def ping():
    """Lightweight startup probe — no heavy imports."""
    return jsonify({"status": "ok"})


@app.route("/health", methods=["GET"])
def health():
    """Health check — also reports GPU availability."""
    import torch

    gpu_name = None
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)

    return jsonify(
        {
            "status": "ok",
            "cuda_available": torch.cuda.is_available(),
            "gpu_name": gpu_name,
        }
    )


@app.route("/run", methods=["POST"])
def run():
    """Run a spike sorting algorithm and store results in GCS."""
    payload = request.get_json(force=True)

    job_id = payload["job_id"]
    algorithm = payload["algorithm"]
    params = payload.get("params", {})
    gcs_bucket = payload["gcs_bucket"]
    gcs_input_path = payload["gcs_input_path"]
    data_shape = tuple(payload["data_shape"])
    dataset_info = payload.get("dataset_info", {})

    logger.info("Job %s: algorithm=%s data_shape=%s", job_id, algorithm, data_shape)

    try:
        # 1) Download input data from GCS
        data = _download_array(gcs_bucket, gcs_input_path)
        logger.info("Job %s: downloaded data shape=%s dtype=%s", job_id, data.shape, data.dtype)

        # 2) Run algorithm
        if algorithm == "jims":
            result = _run_jims(data, params)
        elif algorithm == "kilosort4":
            result = _run_kilosort4(data, params, dataset_info)
        else:
            return jsonify({"success": False, "error": f"Unknown algorithm: {algorithm}"}), 400

        # 3) Upload results to GCS
        gcs_results_path = f"gpu-jobs/{job_id}/results.json"
        _upload_json(gcs_bucket, gcs_results_path, result["clustering_results"])
        logger.info(
            "Job %s: complete — %d clusters, %d spikes",
            job_id,
            result["num_clusters"],
            result["num_spikes"],
        )

        return jsonify(
            {
                "success": True,
                "job_id": job_id,
                "algorithm": algorithm,
                "num_clusters": result["num_clusters"],
                "num_spikes": result["num_spikes"],
                "data_shape": result["data_shape"],
                "gcs_results_path": gcs_results_path,
            }
        )

    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        return jsonify({"success": False, "error": str(exc)}), 500


# ===================================================================
# GCS helpers
# ===================================================================

def _gcs_client():
    from google.cloud import storage
    return storage.Client()


def _download_array(bucket_name: str, path: str) -> np.ndarray:
    client = _gcs_client()
    blob = client.bucket(bucket_name).blob(path)
    buf = io.BytesIO(blob.download_as_bytes())
    return np.load(buf)


def _upload_json(bucket_name: str, path: str, obj: Any) -> None:
    client = _gcs_client()
    blob = client.bucket(bucket_name).blob(path)
    blob.upload_from_string(
        json.dumps(obj), content_type="application/json"
    )


# ===================================================================
# Algorithm runners
# ===================================================================

def _run_jims(data: np.ndarray, params: Dict[str, Any]) -> Dict[str, Any]:
    """Run JimsAlgorithm and return clustering_results in dashboard format."""
    import torch
    from sklearn.decomposition import PCA
    from torchbci.algorithms import JimsAlgorithm

    # JimsAlgorithm runs on CPU — torchbci internally creates tensors on CPU
    # so mixing with CUDA causes device-mismatch errors.
    tensor = torch.from_numpy(np.asarray(data))
    if tensor.dtype != torch.float32:
        tensor = tensor.float()

    logger.info("Running JimsAlgorithm on cpu — data shape %s", tensor.shape)

    pipeline = JimsAlgorithm(
        window_size=int(params.get("window_size", 3)),
        threshold=int(params.get("threshold", 36)),
        frame_size=int(params.get("frame_size", 13)),
        normalize=params.get("normalize", "zscore"),
        sort_by=params.get("sort_by", "value"),
        leniency_channel=int(params.get("leniency_channel", 7)),
        leniency_time=int(params.get("leniency_time", 32)),
        similarity_mode=params.get("similarity_mode", "cosine"),
        outlier_threshold=float(params.get("outlier_threshold", 0.8)),
        n_clusters=int(params.get("n_clusters", 8)),
        cluster_feature_size=int(params.get("cluster_feature_size", 7)),
        n_jims_features=int(params.get("n_jims_features", 7)),
        jims_pad_value=int(params.get("pad_value", 0)),
    )

    clusters, centroids, clusters_meta = pipeline.forward(tensor)

    # PCA transformation (mirrors ClusteringManager._store_clustering_results)
    clusters_picked: list = []
    meta_picked: list = []
    for cluster, _centroid, meta in zip(clusters, centroids, clusters_meta):
        meta_picked.append(sorted(meta, key=lambda x: x[1]))
        clusters_picked.append(cluster)

    pca = PCA(n_components=2)
    all_spikes = np.concatenate(
        [torch.stack(c).cpu().numpy() for c in clusters_picked], axis=0
    )
    all_pca = pca.fit_transform(all_spikes)

    clustering_results: List[List[Dict]] = []
    start = 0
    for cluster_idx, meta_list in enumerate(meta_picked):
        size = len(meta_list)
        pca_block = all_pca[start : start + size]
        cluster_data = []
        for spike_idx, (pca_pt, meta) in enumerate(zip(pca_block, meta_list)):
            cluster_data.append(
                {
                    "x": float(pca_pt[0]),
                    "y": float(pca_pt[1]),
                    "channel": int(meta[0]),
                    "time": int(meta[1]),
                    "spikeIndex": spike_idx,
                }
            )
        clustering_results.append(cluster_data)
        start += size

    n_spikes = sum(len(c) for c in clustering_results)
    return {
        "clustering_results": clustering_results,
        "num_clusters": len(clustering_results),
        "num_spikes": n_spikes,
        "data_shape": list(tensor.shape),
    }


def _run_kilosort4(
    data: np.ndarray, params: Dict[str, Any], dataset_info: Dict[str, Any]
) -> Dict[str, Any]:
    """Run Kilosort4 and return clustering_results in dashboard format."""
    import torch
    from sklearn.decomposition import PCA
    from torchbci.algorithms.kilosort_paper_attempt import KS4Pipeline
    from torchbci.kilosort4.io import load_probe

    # Kilosort4 expects (n_samples, n_channels)
    raw_channels_first = data
    if data.shape[0] < data.shape[1]:
        data = data.T

    logger.info("Running Kilosort4 — data shape %s", data.shape)

    # Write to temp binary
    temp_bin = tempfile.NamedTemporaryFile(delete=False, suffix=".bin")
    np.ascontiguousarray(data).tofile(temp_bin.name)
    temp_bin.close()

    probe_path = params.get(
        "probe_path",
        dataset_info.get("probe_path", "/app/torchbci/data/NeuroPix1_default.mat"),
    )
    sampling_rate = int(
        params.get("sampling_rate", dataset_info.get("sampling_rate", 30000))
    )

    settings = {
        "n_chan_bin": data.shape[1],
        "fs": sampling_rate,
        "filename": temp_bin.name,
        "batch_size": 60000,
        "nblocks": 1,
    }

    probe = load_probe(probe_path)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Kilosort4 device: %s", device)

    original_cwd = os.getcwd()
    temp_dir = tempfile.mkdtemp(prefix="kilosort4_")

    try:
        os.chdir(temp_dir)
        pipeline = KS4Pipeline(
            settings=settings,
            probe=probe,
            results_dir=temp_dir,
            device=device,
        )
        with torch.no_grad():
            out = pipeline()
    finally:
        os.chdir(original_cwd)
        shutil.rmtree(temp_dir, ignore_errors=True)
        try:
            os.unlink(temp_bin.name)
        except OSError:
            pass

    spike_times = out["st"][:, 0]
    spike_clusters = out["clu"]

    # Waveform extraction + PCA (mirrors ClusteringManager._store_kilosort4_results)
    # Use channels-first layout for waveform extraction
    data_cf = raw_channels_first if raw_channels_first.shape[0] < raw_channels_first.shape[1] else raw_channels_first.T

    unique_clusters = np.unique(spike_clusters)
    all_waveforms: list = []
    all_channels: list = []
    cluster_sizes: list = []
    window_size = 15

    for cid in unique_clusters:
        mask = spike_clusters == cid
        ctimes = spike_times[mask]
        wfs: list = []
        pchs: list = []

        for st in ctimes:
            s = int(st)
            if window_size < s < data_cf.shape[1] - window_size:
                window = data_cf[:, s - window_size : s + window_size]
                corrected = window - np.mean(window, axis=1, keepdims=True)
                amps = np.max(np.abs(corrected), axis=1)
                peak_ch = int(np.argmax(amps)) + 1
                wfs.append(window.flatten())
                pchs.append(peak_ch)

        if wfs:
            all_waveforms.extend(wfs)
            all_channels.extend(pchs)
            cluster_sizes.append(len(wfs))

    clustering_results: List[List[Dict]] = []
    if all_waveforms:
        arr = np.array(all_waveforms)
        pca = PCA(n_components=2)

        if len(all_waveforms) > 5000:
            idx = np.random.choice(len(all_waveforms), 5000, replace=False)
            pca.fit(arr[idx])
            pca_coords = pca.transform(arr)
        else:
            pca_coords = pca.fit_transform(arr)

        start = 0
        ch_start = 0
        for cid, size in zip(unique_clusters, cluster_sizes):
            mask = spike_clusters == cid
            ctimes = spike_times[mask]
            block = pca_coords[start : start + size]
            chs = all_channels[ch_start : ch_start + size]

            cluster_data = []
            for i, (pt, st, ch) in enumerate(zip(block, ctimes[:size], chs)):
                cluster_data.append(
                    {
                        "x": float(pt[0]),
                        "y": float(pt[1]),
                        "channel": ch,
                        "time": int(st),
                        "spikeIndex": i,
                    }
                )
            clustering_results.append(cluster_data)
            start += size
            ch_start += size

    n_spikes = sum(len(c) for c in clustering_results)
    return {
        "clustering_results": clustering_results,
        "num_clusters": len(clustering_results),
        "num_spikes": n_spikes,
        "data_shape": list(data.shape),
    }


# ===================================================================
# Entrypoint
# ===================================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
