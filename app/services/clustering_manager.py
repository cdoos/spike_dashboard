"""
Clustering management service.

Handles spike sorting algorithms and clustering operations.
"""

import colorsys
import os
import shutil
import tempfile
from typing import Any, Dict, List, Optional

import numpy as np
import torch

from app.config import Config
from app.services.dataset_manager import DatasetManager
from app.logger import get_logger

logger = get_logger(__name__)

# Try to import spike sorting algorithms
try:
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'torchbci'))
    from torchbci.algorithms import JimsAlgorithm
    JIMS_AVAILABLE = True
    logger.info("Successfully imported JimsAlgorithm")
except ImportError as e:
    JIMS_AVAILABLE = False
    logger.warning(f"JimsAlgorithm not available: {e}")

try:
    from torchbci.algorithms.kilosort_paper_attempt import KS4Pipeline
    from torchbci.kilosort4.io import load_probe
    KILOSORT4_AVAILABLE = True
    logger.info("Successfully imported Kilosort4")
except ImportError as e:
    KILOSORT4_AVAILABLE = False
    logger.warning(f"Kilosort4 not available: {e}")


class ClusteringManager:
    """Manages clustering and spike sorting operations."""
    
    def __init__(self, config: Config, dataset_manager: DatasetManager):
        self.config = config
        self.dataset_manager = dataset_manager
        self.clustering_results: Optional[List[List[Dict]]] = None
    
    @staticmethod
    def is_jims_available() -> bool:
        """Check if JimsAlgorithm is available."""
        return JIMS_AVAILABLE
    
    @staticmethod
    def is_kilosort4_available() -> bool:
        """Check if Kilosort4 is available."""
        return KILOSORT4_AVAILABLE
    
    def run_jims_algorithm(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run JimsAlgorithm spike sorting."""
        if not JIMS_AVAILABLE:
            raise RuntimeError('TorchBCI not available')
        
        if self.dataset_manager.data_array is None:
            raise RuntimeError('No dataset loaded')
        
        logger.info("Running JimsAlgorithm")
        logger.info(f"Data Shape: {self.dataset_manager.data_array.shape}")
        
        data_tensor = self._prepare_tensor()
        jims_sort_pipe = self._create_jims_pipeline(params)
        
        logger.info("Running jims_sort_pipe.forward(data_tensor)...")
        clusters, centroids, clusters_meta = jims_sort_pipe.forward(data_tensor)
        
        n_clustered_spikes = sum([len(meta) for meta in clusters_meta])
        logger.info(f"JimsAlgorithm Results: {len(clusters)} clusters, {n_clustered_spikes} spikes")
        
        self._store_clustering_results(clusters, centroids, clusters_meta)

        response = {
            'success': True,
            'dataShape': list(data_tensor.shape),
            'numClusters': len(clusters),
            'numSpikes': n_clustered_spikes,
            'clusters': []
        }
        
        for i, (cluster, centroid, meta) in enumerate(zip(clusters, centroids, clusters_meta)):
            cluster_info = {
                'clusterId': i,
                'numSpikes': len(meta),
                'centroidShape': list(centroid.shape),
                'spikeTimes': [int(m[1]) for m in meta] if len(meta) > 0 else [],
                'spikeChannels': [int(m[0]) for m in meta] if len(meta) > 0 else []
            }
            response['clusters'].append(cluster_info)
        
        return response
    
    def _prepare_tensor(self) -> torch.Tensor:
        """Prepare data tensor for JimsAlgorithm."""
        if self.dataset_manager.data_array.dtype == np.float32:
            logger.info("Data is already float32, creating torch tensor (zero-copy)...")
            return torch.from_numpy(np.asarray(self.dataset_manager.data_array))
        else:
            logger.info(f"Converting {self.dataset_manager.data_array.dtype} to float32...")
            return torch.from_numpy(np.asarray(self.dataset_manager.data_array)).float()
    
    def _create_jims_pipeline(self, params: Dict[str, Any]):
        """Create JimsAlgorithm pipeline with parameters."""
        return JimsAlgorithm(
            window_size=int(params.get('window_size', 3)),
            threshold=int(params.get('threshold', 36)),
            frame_size=int(params.get('frame_size', 13)),
            normalize=params.get('normalize', 'zscore'),
            sort_by=params.get('sort_by', 'value'),
            leniency_channel=int(params.get('leniency_channel', 7)),
            leniency_time=int(params.get('leniency_time', 32)),
            similarity_mode=params.get('similarity_mode', 'cosine'),
            outlier_threshold=float(params.get('outlier_threshold', 0.8)),
            n_clusters=int(params.get('n_clusters', 8)),
            cluster_feature_size=int(params.get('cluster_feature_size', 7)),
            n_jims_features=int(params.get('n_jims_features', 7)),
            jims_pad_value=int(params.get('pad_value', 0))
        )
    
    def run_kilosort4(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run Kilosort4 spike sorting."""
        if not KILOSORT4_AVAILABLE:
            raise RuntimeError('Kilosort4 not available')

        if self.dataset_manager.data_array is None:
            raise RuntimeError('No dataset loaded')

        logger.info("Running Kilosort4")
        logger.info(f"Data Shape: {self.dataset_manager.data_array.shape}")

        # Get parameters
        probe_path = params.get('probe_path', self.config.DEFAULT_PROBE_PATH)
        sampling_rate = params.get('sampling_rate', self.config.SAMPLING_RATE)

        # Prepare data - Kilosort4 expects (n_samples, n_channels)
        data = np.asarray(self.dataset_manager.data_array)
        if data.shape[0] < data.shape[1]:
            data = data.T

        logger.info(f"Transposed data shape for Kilosort4: {data.shape}")

        # Save to temporary binary file
        temp_bin = tempfile.NamedTemporaryFile(delete=False, suffix='.bin')
        data_c = np.ascontiguousarray(data)
        data_c.tofile(temp_bin.name)
        temp_bin.close()

        logger.debug(f"Saved temporary binary file: {temp_bin.name}")

        settings = {
            "n_chan_bin": data.shape[1],
            "fs": sampling_rate,
            "filename": temp_bin.name,
            "batch_size": 60000,
            "nblocks": 1
        }

        probe = load_probe(probe_path)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {device}")

        original_cwd = os.getcwd()
        temp_results_dir = tempfile.mkdtemp(prefix='kilosort4_')

        try:
            os.chdir(temp_results_dir)
            logger.debug(f"Running in temporary directory: {temp_results_dir}")

            pipeline = KS4Pipeline(
                settings=settings,
                probe=probe,
                results_dir=temp_results_dir,
                device=device
            )

            logger.info("Running Kilosort4 pipeline...")
            with torch.no_grad():
                out = pipeline()
        finally:
            os.chdir(original_cwd)
            try:
                shutil.rmtree(temp_results_dir)
            except Exception:
                pass

        spike_times_samples = out["st"][:, 0]
        spike_clusters = out["clu"]
        n_spikes = out["st"].shape[0]
        n_clusters = np.unique(spike_clusters).size

        logger.info(f"Kilosort4 Results: {n_clusters} clusters, {n_spikes} spikes")

        self._store_kilosort4_results(spike_times_samples, spike_clusters, out)

        try:
            os.unlink(temp_bin.name)
        except Exception:
            pass

        cluster_summaries = []
        for cluster_idx, cluster_data in enumerate(self.clustering_results):
            cluster_summaries.append({
                'clusterId': cluster_idx,
                'numSpikes': len(cluster_data),
                'channels': list(set([spike['channel'] for spike in cluster_data])) if cluster_data else [],
                'timeRange': [
                    min([spike['time'] for spike in cluster_data]) if cluster_data else 0,
                    max([spike['time'] for spike in cluster_data]) if cluster_data else 0
                ] if cluster_data else [0, 0]
            })

        response = {
            'success': True,
            'dataShape': list(data.shape),
            'numClusters': int(n_clusters),
            'numSpikes': int(n_spikes),
            'clusters': cluster_summaries,
            'available': True,
            'totalSpikes': int(n_spikes),
            'fullData': self.clustering_results
        }

        return response

    def _store_kilosort4_results(self, spike_times, spike_clusters, kilosort_output):
        """Store Kilosort4 results with PCA transformation."""
        from sklearn.decomposition import PCA

        unique_clusters = np.unique(spike_clusters)
        self.clustering_results = []

        logger.info(f"Processing {len(spike_times)} spikes across {len(unique_clusters)} clusters...")

        all_spike_waveforms = []
        all_spike_channels = []
        cluster_sizes = []

        for cluster_id in unique_clusters:
            cluster_mask = spike_clusters == cluster_id
            cluster_times = spike_times[cluster_mask]

            waveforms = []
            peak_channels = []
            
            for spike_time in cluster_times:
                spike_sample = int(spike_time)
                window_size = 15
                if window_size < spike_sample < self.dataset_manager.data_array.shape[1] - window_size:
                    window = self.dataset_manager.data_array[:, spike_sample-window_size:spike_sample+window_size]
                    window_baseline_corrected = window - np.mean(window, axis=1, keepdims=True)
                    channel_amplitudes = np.max(np.abs(window_baseline_corrected), axis=1)
                    peak_channel = int(np.argmax(channel_amplitudes)) + 1
                    
                    waveforms.append(window.flatten())
                    peak_channels.append(peak_channel)

            if len(waveforms) > 0:
                all_spike_waveforms.extend(waveforms)
                all_spike_channels.extend(peak_channels)
                cluster_sizes.append(len(waveforms))

        if len(all_spike_waveforms) > 0:
            all_waveforms_array = np.array(all_spike_waveforms)
            pca = PCA(n_components=2)
            
            if len(all_spike_waveforms) > 5000:
                logger.info(f"Optimizing PCA: Fitting on 5000 sample spikes")
                sample_indices = np.random.choice(len(all_spike_waveforms), 5000, replace=False)
                sample_waveforms = all_waveforms_array[sample_indices]
                pca.fit(sample_waveforms)
                pca_coords = pca.transform(all_waveforms_array)
            else:
                pca_coords = pca.fit_transform(all_waveforms_array)

            start_idx = 0
            channel_idx = 0
            for cluster_id, size in zip(unique_clusters, cluster_sizes):
                cluster_mask = spike_clusters == cluster_id
                cluster_times = spike_times[cluster_mask]
                cluster_pca = pca_coords[start_idx:start_idx + size]
                cluster_channels = all_spike_channels[channel_idx:channel_idx + size]

                cluster_data = []
                for i, (pca_point, spike_time, peak_channel) in enumerate(zip(cluster_pca, cluster_times[:size], cluster_channels)):
                    spike_data = {
                        'x': float(pca_point[0]),
                        'y': float(pca_point[1]),
                        'channel': peak_channel,
                        'time': int(spike_time),
                        'spikeIndex': i
                    }
                    cluster_data.append(spike_data)

                self.clustering_results.append(cluster_data)
                start_idx += size
                channel_idx += size

        logger.info(f"Stored Kilosort4 results: {len(self.clustering_results)} clusters")

    def _store_clustering_results(self, clusters, centroids, clusters_meta):
        """Store clustering results with PCA transformation."""
        from sklearn.decomposition import PCA
        
        centroids_picked = []
        clusters_meta_picked = []
        clusters_picked = []
        
        for cluster, centroid, meta in zip(clusters, centroids, clusters_meta):
            meta = sorted(meta, key=lambda x: x[1])
            centroids_picked.append(centroid)
            clusters_meta_picked.append(meta)
            clusters_picked.append(cluster)
        
        pca = PCA(n_components=2)
        all_clustered_spikes = []
        
        for cluster in clusters_picked:
            all_clustered_spikes.append(torch.stack(cluster).numpy())
        
        all_clustered_spikes = np.concatenate(all_clustered_spikes, axis=0)
        all_clustered_spikes_pca = pca.fit_transform(all_clustered_spikes)
        
        all_clustered_spikes_pca_per_cluster = []
        start_idx = 0
        for meta in clusters_meta_picked:
            cluster_size = len(meta)
            cluster_pca = all_clustered_spikes_pca[start_idx:start_idx + cluster_size]
            all_clustered_spikes_pca_per_cluster.append(cluster_pca)
            start_idx += cluster_size
        
        self.clustering_results = []
        for cluster_idx, (pca_coords, meta_list) in enumerate(zip(all_clustered_spikes_pca_per_cluster, clusters_meta_picked)):
            cluster_data = []
            for spike_idx, (pca_point, meta) in enumerate(zip(pca_coords, meta_list)):
                spike_data = {
                    'x': float(pca_point[0]),
                    'y': float(pca_point[1]),
                    'channel': int(meta[0]),
                    'time': int(meta[1]),
                    'spikeIndex': spike_idx
                }
                cluster_data.append(spike_data)
            self.clustering_results.append(cluster_data)
        
        logger.info(f"Stored clustering results: {len(self.clustering_results)} clusters")
    
    def get_cluster_data(self, mode: str, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Get cluster data for visualization."""
        if self.clustering_results is not None:
            logger.info(f"Using stored clustering results ({len(self.clustering_results)} clusters)")
            return self._get_stored_clustering_data(channel_mapping)
        
        if mode == 'real':
            return self._get_real_cluster_data(channel_mapping)
        else:
            return self._get_synthetic_cluster_data(channel_mapping)
    
    def _get_stored_clustering_data(self, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Format stored clustering results for visualization."""
        clusters = []
        total_points = 0
        
        for cluster_idx, cluster_spikes in enumerate(self.clustering_results):
            if not cluster_spikes:
                continue
            
            points = [[spike['x'], spike['y']] for spike in cluster_spikes]
            spike_times = [spike['time'] for spike in cluster_spikes]
            
            channels = [spike['channel'] for spike in cluster_spikes]
            peak_channel = max(set(channels), key=channels.count) if channels else 181
            
            channel_id = channel_mapping.get(str(cluster_idx), peak_channel)
            color = self._generate_cluster_color(cluster_idx, len(self.clustering_results))
            
            clusters.append({
                'clusterId': cluster_idx,
                'points': points,
                'spikeTimes': spike_times,
                'color': color,
                'channelId': channel_id,
                'pointCount': len(points)
            })
            
            total_points += len(points)
        
        return {
            'mode': 'algorithm_results',
            'clusters': clusters,
            'numClusters': len(clusters),
            'totalPoints': total_points,
            'clusterIds': list(range(len(clusters)))
        }
    
    def _get_real_cluster_data(self, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Load real cluster data from file."""
        cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time.npy')
        if not os.path.exists(cluster_file):
            cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
            if not os.path.exists(cluster_file):
                raise FileNotFoundError('Cluster data file not found in labels folder')
        
        logger.info(f"Loading real cluster data from: {cluster_file}")
        spikes_arr = np.load(cluster_file)
        
        xy_coordinates = spikes_arr[:, :2]
        cluster_ids = spikes_arr[:, 2].astype(np.int64)
        times_secs = spikes_arr[:, 3]
        sampling_frequency = self.config.SAMPLING_RATE
        times_indices = (times_secs * sampling_frequency).astype(np.int64)
        
        unique_cluster_ids = np.unique(cluster_ids)
        logger.info(f"Found {len(unique_cluster_ids)} unique clusters with {len(cluster_ids)} total points")
        
        clusters = []
        for cluster_idx, cluster_id in enumerate(unique_cluster_ids):
            mask = cluster_ids == cluster_id
            cluster_points = xy_coordinates[mask]
            cluster_times = times_indices[mask]
            
            color = self._generate_cluster_color(cluster_idx, len(unique_cluster_ids))
            channel_id = channel_mapping.get(str(int(cluster_id))) if channel_mapping else 181
            
            clusters.append({
                'clusterId': int(cluster_id),
                'points': cluster_points.tolist(),
                'spikeTimes': cluster_times.tolist(),
                'color': color,
                'channelId': channel_id,
                'pointCount': len(cluster_points)
            })
        
        return {
            'mode': 'real',
            'clusters': clusters,
            'numClusters': len(clusters),
            'totalPoints': len(cluster_ids),
            'clusterIds': unique_cluster_ids.tolist()
        }
    
    def _get_synthetic_cluster_data(self, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Generate synthetic cluster data."""
        channel_ids = [179, 181, 183]
        np.random.seed(42)
        clusters = []
        colors = ['#FF6B6B', '#4ECDC4', '#FFD700']
        centers = [[2.0, 5.0], [8.0, 2.5], [4.0, 2.0]]
        spreads = [0.8, 0.9, 0.7]
        
        for cluster_idx in range(3):
            cluster_x = np.random.normal(centers[cluster_idx][0], spreads[cluster_idx], 100)
            cluster_y = np.random.normal(centers[cluster_idx][1], spreads[cluster_idx], 100)
            
            clusters.append({
                'clusterId': cluster_idx,
                'points': [[float(x), float(y)] for x, y in zip(cluster_x, cluster_y)],
                'spikeTimes': [],
                'center': centers[cluster_idx],
                'color': colors[cluster_idx],
                'channelId': channel_ids[cluster_idx] if cluster_idx < len(channel_ids) else None,
                'pointCount': 100
            })
        
        return {
            'mode': 'synthetic',
            'clusters': clusters,
            'numClusters': 3,
            'pointsPerCluster': 100,
            'channelIds': channel_ids,
            'totalPoints': 300
        }
    
    @staticmethod
    def _generate_cluster_color(cluster_idx: int, total_clusters: int) -> str:
        """Generate a color for a cluster using HSV color space."""
        golden_ratio = 0.618033988749895
        hue = (cluster_idx * golden_ratio) % 1.0
        saturation = 0.7 + (cluster_idx % 3) * 0.1
        value = 0.85 + (cluster_idx % 2) * 0.1

        r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
        return f'#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}'
    
    def get_clustering_results(self) -> Optional[List[List[Dict]]]:
        """Get stored clustering results."""
        return self.clustering_results
    
    def clear_results(self) -> None:
        """Clear stored clustering results."""
        self.clustering_results = None
