"""
Clustering and spike sorting routes.

Handles cluster data, statistics, waveforms, and spike sorting algorithms.
"""

import os
import numpy as np
from flask import Blueprint, request, jsonify, current_app

from app.logger import get_logger
from app.services.filter_processor import FilterProcessor
from app.services.clustering_manager import ClusteringManager
from app.utils.responses import server_error, validation_error, not_found_error

logger = get_logger(__name__)

clustering_bp = Blueprint('clustering', __name__)


@clustering_bp.route('/api/cluster-data', methods=['POST'])
def get_cluster_data():
    """Get cluster data for visualization."""
    try:
        data = request.get_json()
        mode = data.get('mode', 'synthetic')
        channel_mapping = data.get('channelMapping', {})
        
        clustering_manager = current_app.config['clustering_manager']
        result = clustering_manager.get_cluster_data(mode, channel_mapping)
        return jsonify(result)
    except FileNotFoundError as e:
        return not_found_error('Cluster data file')
    except Exception as e:
        logger.error(f"Error getting cluster data: {e}", exc_info=True)
        return server_error("Failed to get cluster data", exception=e)


@clustering_bp.route('/api/cluster-statistics', methods=['POST'])
def get_cluster_statistics():
    """Get statistics for specified clusters."""
    try:
        data = request.get_json()
        cluster_ids = data.get('clusterIds', [])
        algorithm = data.get('algorithm', 'preprocessed_kilosort')
        
        if not cluster_ids:
            return jsonify({'statistics': {}})
        
        clustering_manager = current_app.config['clustering_manager']
        
        if algorithm in ['torchbci_jims', 'kilosort4'] and clustering_manager.clustering_results is not None:
            statistics = _calculate_algorithm_statistics(clustering_manager, cluster_ids)
        else:
            statistics = _calculate_kilosort_statistics(cluster_ids)
        
        return jsonify({'statistics': statistics})
    except Exception as e:
        logger.error(f"Error getting cluster statistics: {e}", exc_info=True)
        return server_error("Failed to get cluster statistics", exception=e)


def _calculate_algorithm_statistics(clustering_manager, cluster_ids):
    """Calculate statistics for algorithm clusters."""
    statistics = {}
    
    for cluster_id in cluster_ids:
        if cluster_id >= len(clustering_manager.clustering_results):
            continue
        
        cluster_spikes = clustering_manager.clustering_results[cluster_id]
        spike_times_samples = [spike['time'] for spike in cluster_spikes]
        spike_times_secs = np.array(spike_times_samples) / 30000.0
        
        if len(spike_times_secs) > 1:
            sorted_times = np.sort(spike_times_secs)
            isis = np.diff(sorted_times)
            isi_violations = np.sum(isis < 0.002)
            isi_violation_rate = isi_violations / len(isis) if len(isis) > 0 else 0
        else:
            isi_violation_rate = 0
        
        num_spikes = len(cluster_spikes)
        channels = [spike['channel'] for spike in cluster_spikes]
        peak_channel = max(set(channels), key=channels.count) if channels else 181
        
        mean_x = np.mean([spike['x'] for spike in cluster_spikes]) if cluster_spikes else 0
        mean_y = np.mean([spike['y'] for spike in cluster_spikes]) if cluster_spikes else 0
        
        statistics[cluster_id] = {
            'isiViolationRate': float(isi_violation_rate),
            'numSpikes': num_spikes,
            'peakChannel': int(peak_channel),
            'probePosition': {
                'x': int(round(mean_x)),
                'y': int(round(mean_y))
            }
        }
    
    return statistics


def _calculate_kilosort_statistics(cluster_ids):
    """Calculate statistics for Kilosort clusters."""
    config = current_app.config['app_config']
    
    cluster_file = os.path.join(config.LABELS_FOLDER, 'spikes_xyclu_time.npy')
    if not os.path.exists(cluster_file):
        cluster_file = os.path.join(config.LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
        if not os.path.exists(cluster_file):
            raise FileNotFoundError('Cluster data file not found')
    
    spikes_arr = np.load(cluster_file)
    xy_coordinates = spikes_arr[:, :2]
    all_cluster_ids = spikes_arr[:, 2].astype(np.int64)
    times_secs = spikes_arr[:, 3]
    
    statistics = {}
    for cluster_id in cluster_ids:
        mask = all_cluster_ids == cluster_id
        cluster_times = times_secs[mask]
        cluster_xy = xy_coordinates[mask]
        
        if len(cluster_times) > 1:
            sorted_times = np.sort(cluster_times)
            isis = np.diff(sorted_times)
            isi_violations = np.sum(isis < 0.002)
            isi_violation_rate = isi_violations / len(isis) if len(isis) > 0 else 0
        else:
            isi_violation_rate = 0
        
        num_spikes = len(cluster_times)
        mean_x = float(np.mean(cluster_xy[:, 0])) if len(cluster_xy) > 0 else 0
        mean_y = float(np.mean(cluster_xy[:, 1])) if len(cluster_xy) > 0 else 0
        peak_channel = int(182 + (mean_x / 10) * 20)
        
        statistics[cluster_id] = {
            'isiViolationRate': float(isi_violation_rate),
            'numSpikes': int(num_spikes),
            'peakChannel': peak_channel,
            'probePosition': {
                'x': int(round(mean_x)),
                'y': int(round(mean_y))
            }
        }
    
    return statistics


@clustering_bp.route('/api/cluster-waveforms', methods=['POST'])
def get_cluster_waveforms():
    """Get waveforms for specified clusters."""
    try:
        data = request.get_json()
        cluster_ids = data.get('clusterIds', [])
        max_waveforms = data.get('maxWaveforms', 100)
        window_size = data.get('windowSize', 30)
        algorithm = data.get('algorithm', 'preprocessed_kilosort')
        
        dataset_manager = current_app.config['dataset_manager']
        clustering_manager = current_app.config['clustering_manager']
        
        if not cluster_ids or dataset_manager.data_array is None:
            return jsonify({'waveforms': {}})
        
        if algorithm in ['torchbci_jims', 'kilosort4'] and clustering_manager.clustering_results is not None:
            waveforms_data = _get_algorithm_waveforms(
                clustering_manager, dataset_manager, cluster_ids, max_waveforms, window_size
            )
        else:
            waveforms_data = _get_kilosort_waveforms(
                dataset_manager, cluster_ids, max_waveforms, window_size
            )
        
        return jsonify({'waveforms': waveforms_data})
    except Exception as e:
        logger.error(f"Error getting cluster waveforms: {e}", exc_info=True)
        return server_error("Failed to get cluster waveforms", exception=e)


def _get_algorithm_waveforms(clustering_manager, dataset_manager, cluster_ids, max_waveforms, window_size):
    """Get waveforms for algorithm clusters."""
    waveforms_data = {}
    
    for cluster_id in cluster_ids:
        if cluster_id >= len(clustering_manager.clustering_results):
            continue
        
        cluster_spikes = clustering_manager.clustering_results[cluster_id]
        
        if len(cluster_spikes) > max_waveforms:
            indices = np.random.choice(len(cluster_spikes), max_waveforms, replace=False)
            selected_spikes = [cluster_spikes[i] for i in indices]
        else:
            selected_spikes = cluster_spikes
        
        waveforms = []
        for spike in selected_spikes:
            spike_time = spike['time']
            channel = spike['channel']
            channel_idx = channel - 1
            
            start_idx = max(0, int(spike_time) - window_size)
            end_idx = min(dataset_manager.data_array.shape[1], int(spike_time) + window_size)
            
            if start_idx < end_idx and 0 <= channel_idx < dataset_manager.data_array.shape[0]:
                waveform = dataset_manager.data_array[channel_idx, start_idx:end_idx].astype(float)
                
                if len(waveform) > 0:
                    mean = np.mean(waveform)
                    std = np.std(waveform)
                    if std > 0:
                        waveform = (waveform - mean) / std
                
                time_points = [(i - window_size) / 30.0 for i in range(len(waveform))]
                
                waveforms.append({
                    'timePoints': time_points,
                    'amplitude': waveform.tolist()
                })
        
        waveforms_data[cluster_id] = waveforms
    
    return waveforms_data


def _get_kilosort_waveforms(dataset_manager, cluster_ids, max_waveforms, window_size):
    """Get waveforms for Kilosort clusters."""
    config = current_app.config['app_config']
    
    cluster_file = os.path.join(config.LABELS_FOLDER, 'spikes_xyclu_time.npy')
    if not os.path.exists(cluster_file):
        cluster_file = os.path.join(config.LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
        if not os.path.exists(cluster_file):
            raise FileNotFoundError('Cluster data file not found')
    
    spikes_arr = np.load(cluster_file)
    all_cluster_ids = spikes_arr[:, 2].astype(np.int64)
    times_secs = spikes_arr[:, 3]
    sampling_frequency = 30000
    times_indices = (times_secs * sampling_frequency).astype(np.int64)
    
    waveforms_data = {}
    for cluster_id in cluster_ids:
        mask = all_cluster_ids == cluster_id
        cluster_times = times_indices[mask]
        
        if len(cluster_times) > max_waveforms:
            indices = np.random.choice(len(cluster_times), max_waveforms, replace=False)
            cluster_times = cluster_times[indices]
        
        peak_channel = 181
        channel_idx = peak_channel - 1
        
        waveforms = []
        for spike_time in cluster_times:
            start_idx = max(0, int(spike_time) - window_size)
            end_idx = min(dataset_manager.data_array.shape[1], int(spike_time) + window_size)
            
            if start_idx < end_idx:
                waveform = dataset_manager.data_array[channel_idx, start_idx:end_idx].astype(float)
                
                if len(waveform) > 0:
                    mean = np.mean(waveform)
                    std = np.std(waveform)
                    if std > 0:
                        waveform = (waveform - mean) / std
                
                time_points = [(i - window_size) / 30.0 for i in range(len(waveform))]
                
                waveforms.append({
                    'timePoints': time_points,
                    'amplitude': waveform.tolist()
                })
        
        waveforms_data[cluster_id] = waveforms
    
    return waveforms_data


@clustering_bp.route('/api/cluster-multi-channel-waveforms', methods=['POST'])
def get_cluster_multi_channel_waveforms():
    """Get multi-channel waveforms for a cluster."""
    try:
        data = request.get_json()
        cluster_id = data.get('clusterId')
        max_waveforms = data.get('maxWaveforms', 50)
        window_size = data.get('windowSize', 30)
        algorithm = data.get('algorithm', 'preprocessed_kilosort')
        
        dataset_manager = current_app.config['dataset_manager']
        clustering_manager = current_app.config['clustering_manager']
        
        if cluster_id is None or dataset_manager.data_array is None:
            return validation_error('Invalid cluster ID or no data loaded')
        
        spike_times, spike_channels = _get_cluster_spike_info(
            cluster_id, algorithm, clustering_manager
        )
        
        if not spike_times:
            return not_found_error('Spikes for cluster', str(cluster_id))
        
        # Determine peak channel
        channel_counts = {}
        for ch in spike_channels:
            channel_counts[ch] = channel_counts.get(ch, 0) + 1
        
        peak_channel = max(channel_counts, key=channel_counts.get)
        neighbor_offsets = [-2, -1, 0, 1, 2]
        target_channels = [peak_channel + offset for offset in neighbor_offsets]
        
        if len(spike_times) > max_waveforms:
            indices = np.random.choice(len(spike_times), max_waveforms, replace=False)
            selected_times = [spike_times[i] for i in indices]
        else:
            selected_times = spike_times
        
        channels_data = {}
        for target_channel in target_channels:
            channel_idx = target_channel - 1
            
            if channel_idx < 0 or channel_idx >= dataset_manager.data_array.shape[0]:
                continue
            
            waveforms = []
            for spike_time in selected_times:
                start_idx = max(0, int(spike_time) - window_size)
                end_idx = min(dataset_manager.data_array.shape[1], int(spike_time) + window_size)
                
                if start_idx < end_idx:
                    waveform = dataset_manager.data_array[channel_idx, start_idx:end_idx].astype(float)
                    
                    if len(waveform) > 0:
                        mean = np.mean(waveform)
                        std = np.std(waveform)
                        if std > 0:
                            waveform = (waveform - mean) / std
                    
                    time_points = [(i - window_size) / 30.0 for i in range(len(waveform))]
                    
                    waveforms.append({
                        'timePoints': time_points,
                        'amplitude': waveform.tolist()
                    })
            
            channels_data[target_channel] = {
                'channelId': target_channel,
                'waveforms': waveforms,
                'isPeak': target_channel == peak_channel
            }
        
        return jsonify({
            'clusterId': cluster_id,
            'peakChannel': peak_channel,
            'channels': channels_data
        })
    except Exception as e:
        logger.error(f"Error getting multi-channel waveforms: {e}", exc_info=True)
        return server_error("Failed to get multi-channel waveforms", exception=e)


def _get_cluster_spike_info(cluster_id, algorithm, clustering_manager):
    """Get spike times and channels for a cluster."""
    spike_times = []
    spike_channels = []
    
    if algorithm in ['torchbci_jims', 'kilosort4'] and clustering_manager.clustering_results is not None:
        if cluster_id >= len(clustering_manager.clustering_results):
            return spike_times, spike_channels
        
        cluster_spikes = clustering_manager.clustering_results[cluster_id]
        for spike in cluster_spikes:
            spike_times.append(int(spike['time']))
            spike_channels.append(int(spike['channel']))
    else:
        config = current_app.config['app_config']
        
        cluster_file = os.path.join(config.LABELS_FOLDER, 'spikes_xyclu_time.npy')
        if not os.path.exists(cluster_file):
            cluster_file = os.path.join(config.LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
            if not os.path.exists(cluster_file):
                return spike_times, spike_channels
        
        spikes_arr = np.load(cluster_file)
        all_cluster_ids = spikes_arr[:, 2].astype(np.int64)
        times_secs = spikes_arr[:, 3]
        sampling_frequency = 30000
        times_indices = (times_secs * sampling_frequency).astype(np.int64)
        
        mask = all_cluster_ids == cluster_id
        spike_times = times_indices[mask].tolist()
        spike_channels = [181] * len(spike_times)
    
    return spike_times, spike_channels


@clustering_bp.route('/api/spike-sorting/algorithms', methods=['GET'])
def list_spike_sorting_algorithms():
    """List all available spike sorting algorithms."""
    algorithms = [
        {
            'name': 'preprocessed_kilosort',
            'displayName': 'Preprocessed Kilosort',
            'description': 'Pre-computed cluster data from Kilosort',
            'available': True,
            'requiresRun': False
        },
        {
            'name': 'torchbci_jims',
            'displayName': 'TorchBCI Algorithm',
            'description': "Jim's spike sorting algorithm with clustering",
            'available': ClusteringManager.is_jims_available(),
            'requiresRun': True
        },
        {
            'name': 'kilosort4',
            'displayName': 'Kilosort4',
            'description': 'State-of-the-art spike sorting with Kilosort4',
            'available': ClusteringManager.is_kilosort4_available(),
            'requiresRun': True
        }
    ]
    
    return jsonify({'algorithms': algorithms})


@clustering_bp.route('/api/spike-sorting/run', methods=['POST'])
def run_spike_sorting():
    """Run spike sorting algorithm."""
    try:
        request_data = request.get_json() or {}
        algorithm = request_data.get('algorithm', 'torchbci_jims')
        params = request_data.get('parameters', {})
        
        clustering_manager = current_app.config['clustering_manager']

        if algorithm == 'kilosort4':
            response = clustering_manager.run_kilosort4(params)
        else:
            response = clustering_manager.run_jims_algorithm(params)

        return jsonify(response), 200
    except RuntimeError as e:
        logger.error(f"Runtime error running spike sorting: {e}")
        return server_error(str(e))
    except Exception as e:
        logger.error(f"Error running spike sorting: {e}", exc_info=True)
        return server_error("Failed to run spike sorting", exception=e)


@clustering_bp.route('/api/clustering-results', methods=['GET'])
def get_clustering_results():
    """Get stored clustering results."""
    clustering_manager = current_app.config['clustering_manager']
    
    if clustering_manager.clustering_results is None:
        return jsonify({
            'available': False,
            'message': 'No clustering results available. Run the spike sorting algorithm first.'
        }), 200
    
    try:
        cluster_summaries = []
        for cluster_idx, cluster_data in enumerate(clustering_manager.clustering_results):
            cluster_summaries.append({
                'clusterId': cluster_idx,
                'numSpikes': len(cluster_data),
                'channels': list(set([spike['channel'] for spike in cluster_data])) if cluster_data else [],
                'timeRange': [
                    min([spike['time'] for spike in cluster_data]) if cluster_data else 0,
                    max([spike['time'] for spike in cluster_data]) if cluster_data else 0
                ] if cluster_data else [0, 0]
            })
        
        return jsonify({
            'available': True,
            'numClusters': len(clustering_manager.clustering_results),
            'totalSpikes': sum(len(cluster) for cluster in clustering_manager.clustering_results),
            'clusters': cluster_summaries,
            'fullData': clustering_manager.clustering_results
        }), 200
    except Exception as e:
        logger.error(f"Error fetching clustering results: {e}", exc_info=True)
        return server_error("Failed to fetch clustering results", exception=e)
