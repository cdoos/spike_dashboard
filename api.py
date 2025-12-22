from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import json
import os
import sys
from werkzeug.utils import secure_filename
import torch
from scipy.signal import butter, filtfilt
from typing import Optional, Dict, List, Tuple, Any
import colorsys

# Add torchbci folder to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'torchbci'))

# Try to import JimsAlgorithm from local torchbci folder
try:
    from torchbci.algorithms import JimsAlgorithm
    JIMS_AVAILABLE = True
    print("✓ Successfully imported JimsAlgorithm from local torchbci folder")
except ImportError as e:
    JIMS_AVAILABLE = False
    print(f"Warning: torchbci JimsAlgorithm not available. Error: {e}")

# Try to import Kilosort4 pipeline
try:
    from torchbci.algorithms.kilosort_paper_attempt import KS4Pipeline
    from torchbci.kilosort4.io import load_probe
    KILOSORT4_AVAILABLE = True
    print("✓ Successfully imported Kilosort4 from local torchbci folder")
except ImportError as e:
    KILOSORT4_AVAILABLE = False
    print(f"Warning: Kilosort4 not available. Error: {e}")


class Config:
    """Application configuration"""
    DATASETS_FOLDER = 'datasets'
    LABELS_FOLDER = os.path.join('datasets', 'labels')
    MAPPING_DB_PATH = os.path.join('datasets', 'dataset_labels_mapping.json')
    ALLOWED_EXTENSIONS = {'bin', 'dat', 'raw', 'pt', 'npy'}
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024 * 1024
    DEFAULT_DATASET = 'c46_data_5percent.pt'
    DEFAULT_CHANNELS = 385


class DatasetManager:
    """Manages dataset loading and access"""
    
    def __init__(self, config: Config):
        self.config = config
        self.data_array: Optional[np.ndarray] = None
        self.current_dataset: Optional[str] = config.DEFAULT_DATASET
        self.nrows: int = config.DEFAULT_CHANNELS
        
    def load_data(self, filename: Optional[str] = None) -> Optional[np.ndarray]:
        """Load binary data from file"""
        if filename is None:
            filename = self.current_dataset
        
        dataset_path = os.path.join(self.config.DATASETS_FOLDER, filename)
        if not os.path.exists(dataset_path):
            dataset_path = filename
            if not os.path.exists(dataset_path):
                print(f"Warning: {filename} not found. Using mock data.")
                return None
        
        try:
            file_ext = os.path.splitext(filename)[1].lower()
            
            if file_ext == '.pt':
                self.data_array = self._load_pt_file(dataset_path, filename)
            elif file_ext == '.npy':
                self.data_array = self._load_npy_file(dataset_path)
            else:
                self.data_array = self._load_binary_file(dataset_path)
            
            if self.data_array is not None:
                self.nrows = self.data_array.shape[0]
                self.current_dataset = filename
                
            return self.data_array
            
        except Exception as e:
            print(f"Error loading data: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _load_pt_file(self, dataset_path: str, filename: str) -> Optional[np.ndarray]:
        """Load PyTorch file with optimized memory mapping"""
        float32_path = dataset_path.replace('.pt', '_float32.npy')
        
        if os.path.exists(float32_path):
            print(f"🚀 Found preprocessed float32 file: {float32_path}")
            print("Loading as memmap (efficient, no disk thrashing)...")
            data = np.load(float32_path, allow_pickle=True, mmap_mode='r')
            print(f"✓ Loaded float32 memmap: {data.shape}, dtype: {data.dtype}")
            return data
        
        npy_path = dataset_path.replace('.pt', '_mmap.npy')
        shape_path = dataset_path.replace('.pt', '_shape.txt')
        
        if os.path.exists(npy_path) and os.path.exists(shape_path):
            print(f"🚀 Loading memory-mapped array from {npy_path}")
            with open(shape_path, 'r') as f:
                shape = tuple(map(int, f.read().strip().split(',')))
            data = np.memmap(npy_path, dtype=np.int16, mode='r', shape=shape)
            print(f"✓ Memory-mapped data loaded: {data.shape}")
            print(f"💡 TIP: Convert to float32 for better JimsAlgorithm performance: python convert_to_float32.py")
            return data
        
        print(f"Loading PyTorch tensor from {dataset_path}")
        print(f"⚠️  WARNING: Loading full {os.path.getsize(dataset_path)/(1024**3):.2f} GB into RAM")
        
        tensor_data = torch.load(dataset_path, weights_only=False)
        
        if torch.is_tensor(tensor_data):
            data = tensor_data.numpy()
        elif isinstance(tensor_data, np.ndarray):
            data = tensor_data
        else:
            print(f"Error: Unexpected data type in .pt file: {type(tensor_data)}")
            return None
        
        if data.ndim == 2 and data.shape[0] > data.shape[1]:
            print(f"Transposing data from {data.shape} to ({data.shape[1]}, {data.shape[0]})")
            data = data.T
        
        print(f"Loaded PyTorch data: {data.shape}")
        return data
    
    def _load_npy_file(self, dataset_path: str) -> Optional[np.ndarray]:
        """Load numpy file with memory mapping"""
        float32_path = dataset_path.replace('.npy', '_float32.npy')
        
        if '_float32.npy' in dataset_path or os.path.exists(float32_path):
            path = dataset_path if '_float32.npy' in dataset_path else float32_path
            print(f"Loading float32 numpy memmap from {path}")
            data = np.load(path, allow_pickle=True, mmap_mode='r')
            print(f"Loaded float32 memmap: {data.shape}, dtype: {data.dtype}")
        else:
            print(f"Loading numpy memmap from {dataset_path}")
            data = np.load(dataset_path, allow_pickle=True, mmap_mode='r')
            print(f"Loaded memmap: {data.shape}, dtype: {data.dtype}")
            
            if data.dtype != np.float32:
                print(f"💡 TIP: Convert to float32 for better performance: python convert_to_float32.py")
        
        return data
    
    def _load_binary_file(self, dataset_path: str) -> Optional[np.ndarray]:
        """Load binary file with memory mapping"""
        float32_path = dataset_path.replace('.bin', '_float32.npy')
        
        if os.path.exists(float32_path):
            print(f"Found preprocessed float32 file: {float32_path}")
            data = np.load(float32_path, allow_pickle=True, mmap_mode='r')
            print(f"Loaded float32 memmap: {data.shape}, dtype: {data.dtype}")
        else:
            print(f"Loading int16 binary from {dataset_path}")
            print(f"Tip: Run convert_to_float32.py to preprocess for better performance!")
            data_memmap = np.memmap(dataset_path, dtype=np.int16, mode='r')
            data = data_memmap.reshape((-1, self.nrows)).T
        
        return data
    
    def get_channel_data(self, channel_id: int, start_time: int, end_time: int) -> Optional[np.ndarray]:
        """Get data for a specific channel and time range"""
        if self.data_array is None:
            return None
        
        array_index = channel_id - 1
        if array_index >= self.data_array.shape[0] or array_index < 0:
            return None
        
        total_available = self.data_array.shape[1]
        start_time = max(0, int(start_time))
        end_time = min(total_available, int(end_time))
        
        return self.data_array[array_index, start_time:end_time]


class LabelMappingManager:
    """Manages dataset to label file mappings"""
    
    def __init__(self, config: Config):
        self.config = config
        self.mappings: Dict[str, str] = {}
        self.load_mappings()
    
    def load_mappings(self):
        """Load the dataset-to-label mapping database"""
        if os.path.exists(self.config.MAPPING_DB_PATH):
            try:
                with open(self.config.MAPPING_DB_PATH, 'r') as f:
                    self.mappings = json.load(f)
                print(f"Loaded mapping database: {len(self.mappings)} entries")
            except Exception as e:
                print(f"Error loading mapping database: {e}")
                self.mappings = {}
        else:
            self.mappings = {}
            self.save_mappings()
    
    def save_mappings(self):
        """Save the dataset-to-label mapping database"""
        try:
            with open(self.config.MAPPING_DB_PATH, 'w') as f:
                json.dump(self.mappings, f, indent=2)
            print(f"Saved mapping database: {len(self.mappings)} entries")
        except Exception as e:
            print(f"Error saving mapping database: {e}")
    
    def add_mapping(self, dataset_name: str, label_filename: str):
        """Add or update a dataset-to-label mapping"""
        self.mappings[dataset_name] = label_filename
        self.save_mappings()
        print(f"Added mapping: {dataset_name} -> {label_filename}")
    
    def get_mapping(self, dataset_name: str) -> Optional[str]:
        """Get the label filename for a given dataset"""
        return self.mappings.get(dataset_name)
    
    def remove_mapping(self, dataset_name: str):
        """Remove a dataset-to-label mapping"""
        if dataset_name in self.mappings:
            del self.mappings[dataset_name]
            self.save_mappings()
            print(f"Removed mapping for: {dataset_name}")
    
    def migrate_existing_labels(self):
        """Move spike time files from datasets to labels folder and auto-detect mappings"""
        if not os.path.exists(self.config.DATASETS_FOLDER):
            return
        
        label_patterns = ['_spike_times.pt', '_spikes.pt', '_times.pt', '_labels']
        
        for filename in os.listdir(self.config.DATASETS_FOLDER):
            if any(pattern in filename for pattern in label_patterns) and filename.endswith('.pt'):
                old_path = os.path.join(self.config.DATASETS_FOLDER, filename)
                new_path = os.path.join(self.config.LABELS_FOLDER, filename)
                if os.path.isfile(old_path) and not os.path.exists(new_path):
                    try:
                        import shutil
                        shutil.move(old_path, new_path)
                        print(f"Migrated label file: {filename} -> datasets/labels/")
                        
                        base_name = filename.replace('_labels', '_data').replace('_spike_times', '').replace('_spikes', '').replace('_times', '')
                        if not base_name.endswith('.pt'):
                            base_name = base_name + '.pt'
                        
                        dataset_path = os.path.join(self.config.DATASETS_FOLDER, base_name)
                        if os.path.exists(dataset_path):
                            self.add_mapping(base_name, filename)
                            print(f"Auto-detected mapping: {base_name} -> {filename}")
                    except Exception as e:
                        print(f"Error migrating {filename}: {e}")


class SpikeTimesManager:
    """Manages spike times data"""
    
    def __init__(self, config: Config, mapping_manager: LabelMappingManager):
        self.config = config
        self.mapping_manager = mapping_manager
        self.spike_times_data: Optional[Any] = None
    
    def load_spike_times(self, dataset_filename: str) -> bool:
        """Load spike times file associated with a dataset"""
        print(f"\n=== Loading spike times for: {dataset_filename} ===")
        self.spike_times_data = None
        
        label_filename = self.mapping_manager.get_mapping(dataset_filename)
        print(f"Label filename from mapping: {label_filename}")
        
        if not label_filename:
            print(f"❌ No label mapping found for dataset: {dataset_filename}")
            return False
        
        spike_path = os.path.join(self.config.LABELS_FOLDER, label_filename)
        print(f"Looking for spike times at: {spike_path}")
        
        if not os.path.exists(spike_path):
            print(f"❌ Label file not found: {spike_path}")
            return False
        
        try:
            print(f"📂 Loading spike times from: {spike_path}")
            loaded_data = torch.load(spike_path, weights_only=False)
            
            if isinstance(loaded_data, np.ndarray):
                self.spike_times_data = loaded_data
                print(f"✓ Using spike times as numpy array: {len(self.spike_times_data)} spikes")
            elif torch.is_tensor(loaded_data):
                self.spike_times_data = loaded_data.numpy()
                print(f"✓ Converted torch tensor to numpy array: {len(self.spike_times_data)} spikes")
            elif isinstance(loaded_data, dict):
                self.spike_times_data = {}
                for key in loaded_data:
                    if torch.is_tensor(loaded_data[key]):
                        self.spike_times_data[key] = loaded_data[key].numpy()
                    else:
                        self.spike_times_data[key] = loaded_data[key]
                print(f"✓ Using channel-specific spike times: {len(self.spike_times_data)} channels")
            
            print(f"✓✓✓ Spike times loaded successfully! ✓✓✓")
            return True
        except Exception as e:
            print(f"❌ Error loading spike times from {spike_path}: {e}")
            import traceback
            traceback.print_exc()
            self.spike_times_data = None
            return False
    
    def get_spike_times_info(self) -> Dict[str, Any]:
        """Get information about loaded spike times"""
        is_available = self.spike_times_data is not None
        
        if isinstance(self.spike_times_data, (np.ndarray, list)):
            spike_type = 'global'
            spike_count = len(self.spike_times_data)
            channels = []
        elif isinstance(self.spike_times_data, dict):
            spike_type = 'channel_specific'
            spike_count = sum(len(v) for v in self.spike_times_data.values())
            channels = list(self.spike_times_data.keys())
        else:
            spike_type = 'none'
            spike_count = 0
            channels = []
        
        return {
            'available': is_available,
            'type': spike_type,
            'count': spike_count,
            'channels': channels
        }
    
    def navigate_spike(self, current_time: int, direction: str, channels: List[int]) -> Optional[Tuple[int, int]]:
        """Find next or previous spike time"""
        if self.spike_times_data is None:
            return None
        
        all_spikes = []
        
        if isinstance(self.spike_times_data, np.ndarray):
            all_spikes = self.spike_times_data.tolist() if hasattr(self.spike_times_data, 'tolist') else list(self.spike_times_data)
        elif isinstance(self.spike_times_data, dict):
            for channel_id in channels:
                channel_spikes = self.spike_times_data.get(channel_id) or self.spike_times_data.get(str(channel_id))
                if channel_spikes is not None:
                    if isinstance(channel_spikes, list):
                        all_spikes.extend(channel_spikes)
                    else:
                        all_spikes.extend(channel_spikes.tolist() if hasattr(channel_spikes, 'tolist') else list(channel_spikes))
        
        if not all_spikes:
            return None
        
        unique_spikes = sorted(set(all_spikes))
        target_spike = None
        
        if direction == 'next':
            for spike_time in unique_spikes:
                if spike_time > current_time:
                    target_spike = spike_time
                    break
            if target_spike is None and unique_spikes:
                target_spike = unique_spikes[0]
        else:
            for spike_time in reversed(unique_spikes):
                if spike_time < current_time:
                    target_spike = spike_time
                    break
            if target_spike is None and unique_spikes:
                target_spike = unique_spikes[-1]
        
        if target_spike is None:
            return None
        
        return (int(target_spike), len(unique_spikes))


class FilterProcessor:
    """Handles signal filtering operations"""
    
    @staticmethod
    def apply_filter(data: np.ndarray, filter_type: str = 'highpass', 
                    sampling_rate: int = 30000, order: int = 4) -> np.ndarray:
        """Apply Butterworth filter to signal"""
        try:
            nyquist = sampling_rate / 2.0
            
            if filter_type == 'highpass':
                cutoff_freq = 300
                normalized_cutoff = cutoff_freq / nyquist
                b, a = butter(order, normalized_cutoff, btype='high', analog=False)
            elif filter_type == 'lowpass':
                cutoff_freq = 3000
                normalized_cutoff = cutoff_freq / nyquist
                b, a = butter(order, normalized_cutoff, btype='low', analog=False)
            elif filter_type == 'bandpass':
                low_cutoff = 300
                high_cutoff = 3000
                low_normalized = low_cutoff / nyquist
                high_normalized = high_cutoff / nyquist
                b, a = butter(order, [low_normalized, high_normalized], btype='band', analog=False)
            else:
                print(f"Unknown filter type: {filter_type}")
                return data
            
            filtered_data = filtfilt(b, a, data)
            return filtered_data
        except Exception as e:
            print(f"Error applying {filter_type} filter: {e}")
            return data


class SpikeDataProcessor:
    """Processes spike data for visualization"""
    
    def __init__(self, dataset_manager: DatasetManager, spike_times_manager: SpikeTimesManager):
        self.dataset_manager = dataset_manager
        self.spike_times_manager = spike_times_manager
    
    def get_real_data(self, channels: List[int], spike_threshold: Optional[int], 
                     invert_data: bool, start_time: int, end_time: int, 
                     data_type: str, filter_type: str) -> Dict[int, Any]:
        """Get real spike data for requested channels"""
        if self.dataset_manager.data_array is None:
            return {}
        
        total_available = self.dataset_manager.data_array.shape[1]
        start_time = max(0, int(start_time))
        end_time = min(total_available, int(end_time))
        
        data = {}
        
        for channel_id in channels:
            channel_data = self.dataset_manager.get_channel_data(channel_id, start_time, end_time)
            if channel_data is None:
                continue
            
            original_raw_data = channel_data.copy()
            filtered_data = None
            
            if filter_type != 'none':
                filtered_data = self._apply_filter_with_buffer(
                    channel_id, start_time, end_time, total_available, 
                    channel_data, filter_type, data_type
                )
                if data_type == 'spikes':
                    channel_data = np.round(filtered_data).astype(int)
                elif data_type == 'filtered':
                    channel_data = original_raw_data
            
            if invert_data:
                channel_data = -channel_data
                if filtered_data is not None:
                    filtered_data = -filtered_data
            
            is_spike, spike_peaks = self._detect_spikes(
                channel_data, spike_threshold, invert_data
            )
            
            print(f"Channel {channel_id}: Sending {len(channel_data)} points (range: {start_time}-{end_time}, type: {data_type}, filter: {filter_type}, peaks: {len(spike_peaks)})")
            
            data[channel_id] = {
                'data': channel_data.tolist(),
                'isSpike': is_spike if isinstance(is_spike, list) else is_spike.tolist(),
                'spikePeaks': spike_peaks,
                'channelId': channel_id,
                'startTime': start_time,
                'endTime': end_time
            }
            
            if filtered_data is not None:
                data[channel_id]['filteredData'] = np.round(filtered_data).astype(int).tolist()
        
        return data
    
    def get_precomputed_spike_data(self, channels: List[int], start_time: int, 
                                  end_time: int, filter_type: str, 
                                  invert_data: bool, data_type: str) -> Dict[int, Any]:
        """Get spike data using precomputed spike times"""
        if self.dataset_manager.data_array is None or self.spike_times_manager.spike_times_data is None:
            return {}
        
        total_available = self.dataset_manager.data_array.shape[1]
        data = {}
        spike_window = 5
        
        is_global = isinstance(self.spike_times_manager.spike_times_data, np.ndarray)
        all_spike_times = self.spike_times_manager.spike_times_data if is_global else None
        
        for channel_id in channels:
            channel_data = self.dataset_manager.get_channel_data(channel_id, start_time, end_time)
            if channel_data is None:
                continue
            
            original_raw_data = channel_data.copy()
            filtered_data_array = None
            
            if filter_type != 'none':
                filtered_data_array = self._apply_filter_with_buffer(
                    channel_id, start_time, end_time, total_available,
                    channel_data, filter_type, data_type
                )
                if data_type == 'spikes':
                    channel_data = np.round(filtered_data_array).astype(int)
                elif data_type == 'filtered':
                    channel_data = original_raw_data
            
            if invert_data:
                channel_data = -channel_data
                if filtered_data_array is not None:
                    filtered_data_array = -filtered_data_array
            
            if is_global:
                spike_times_list = all_spike_times
            else:
                spike_times_list = self.spike_times_manager.spike_times_data.get(channel_id, [])
            
            spike_peaks = [int(t - start_time) for t in spike_times_list 
                          if start_time <= t < end_time]
            
            is_spike = [False] * len(channel_data)
            for peak_idx in spike_peaks:
                for offset in range(-spike_window, spike_window + 1):
                    idx = peak_idx + offset
                    if 0 <= idx < len(is_spike):
                        is_spike[idx] = True
            
            print(f"Channel {channel_id}: {len(spike_peaks)} spikes (±{spike_window} window), filter={filter_type}, global={is_global}")
            
            data[channel_id] = {
                'data': channel_data.tolist(),
                'isSpike': is_spike,
                'spikePeaks': spike_peaks,
                'channelId': channel_id,
                'startTime': start_time,
                'endTime': end_time,
                'precomputed': True
            }
            
            if filtered_data_array is not None and data_type == 'filtered':
                data[channel_id]['filteredData'] = np.round(filtered_data_array).astype(int).tolist()
        
        return data
    
    def _apply_filter_with_buffer(self, channel_id: int, start_time: int, 
                                  end_time: int, total_available: int,
                                  channel_data: np.ndarray, filter_type: str,
                                  data_type: str) -> np.ndarray:
        """Apply filter with buffer to avoid edge effects"""
        buffer = 100
        buffer_start = max(0, start_time - buffer)
        buffer_end = min(total_available, end_time + buffer)
        buffered_data = self.dataset_manager.data_array[channel_id - 1, buffer_start:buffer_end]
        
        original_mean = np.mean(channel_data)
        filtered_buffered = FilterProcessor.apply_filter(buffered_data.astype(float), filter_type=filter_type)
        
        offset = start_time - buffer_start
        filtered_data = filtered_buffered[offset:offset + len(channel_data)]
        
        if filter_type in ['highpass', 'bandpass']:
            filtered_data = filtered_data + original_mean
        
        return filtered_data
    
    def _detect_spikes(self, channel_data: np.ndarray, spike_threshold: Optional[int],
                      invert_data: bool) -> Tuple[Any, List[int]]:
        """Detect spikes in channel data"""
        if spike_threshold is not None:
            if invert_data:
                is_spike = channel_data >= spike_threshold
            else:
                is_spike = channel_data <= spike_threshold
        else:
            is_spike = [False] * len(channel_data)
        
        spike_peaks = []
        if spike_threshold is not None:
            in_spike = False
            spike_start_idx = 0
            
            for i in range(len(is_spike)):
                if is_spike[i] and not in_spike:
                    in_spike = True
                    spike_start_idx = i
                elif (not is_spike[i] or i == len(is_spike) - 1) and in_spike:
                    spike_end_idx = i if not is_spike[i] else i + 1
                    spike_segment = channel_data[spike_start_idx:spike_end_idx]
                    
                    if len(spike_segment) > 0:
                        if invert_data:
                            peak_idx = spike_start_idx + int(np.argmax(spike_segment))
                        else:
                            peak_idx = spike_start_idx + int(np.argmin(spike_segment))
                        spike_peaks.append(peak_idx)
                    
                    in_spike = False
        
        return is_spike, spike_peaks


class ClusteringManager:
    """Manages clustering and spike sorting operations"""
    
    def __init__(self, config: Config, dataset_manager: DatasetManager):
        self.config = config
        self.dataset_manager = dataset_manager
        self.clustering_results: Optional[List[List[Dict]]] = None
    
    def run_jims_algorithm(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run JimsAlgorithm spike sorting"""
        if not JIMS_AVAILABLE:
            raise RuntimeError('TorchBCI not available')
        
        if self.dataset_manager.data_array is None:
            raise RuntimeError('No dataset loaded')
        
        print(f"\n{'='*60}")
        print(f"Running JimsAlgorithm with parameters:")
        print(f"{'='*60}")
        print(f"Data Shape: {self.dataset_manager.data_array.shape}")
        
        data_tensor = self._prepare_tensor()
        jims_sort_pipe = self._create_jims_pipeline(params)
        
        print("Running jims_sort_pipe.forward(data_tensor)...")
        clusters, centroids, clusters_meta = jims_sort_pipe.forward(data_tensor)
        
        n_clustered_spikes = sum([len(meta) for meta in clusters_meta])
        print(f"\n{'='*60}")
        print(f"JimsAlgorithm Results:")
        print(f"{'='*60}")
        print(f"Number of clusters: {len(clusters)}")
        print(f"Number of detected spikes: {n_clustered_spikes}")
        
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
        """Prepare data tensor for JimsAlgorithm"""
        if self.dataset_manager.data_array.dtype == np.float32:
            print("\nData is already float32, creating torch tensor (zero-copy)...")
            return torch.from_numpy(np.asarray(self.dataset_manager.data_array))
        else:
            print(f"\nConverting {self.dataset_manager.data_array.dtype} to float32...")
            return torch.from_numpy(np.asarray(self.dataset_manager.data_array)).float()
    
    def _create_jims_pipeline(self, params: Dict[str, Any]):
        """Create JimsAlgorithm pipeline with parameters"""
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
        """Run Kilosort4 spike sorting"""
        if not KILOSORT4_AVAILABLE:
            raise RuntimeError('Kilosort4 not available')

        if self.dataset_manager.data_array is None:
            raise RuntimeError('No dataset loaded')

        print(f"\n{'='*60}")
        print(f"Running Kilosort4 with parameters:")
        print(f"{'='*60}")
        print(f"Data Shape: {self.dataset_manager.data_array.shape}")

        # Get parameters
        probe_path = params.get('probe_path', 'torchbci/data/NeuroPix1_default.mat')
        sampling_rate = params.get('sampling_rate', 30000)

        # Prepare data - Kilosort4 expects (n_samples, n_channels)
        data = np.asarray(self.dataset_manager.data_array)
        if data.shape[0] < data.shape[1]:  # If (channels, samples)
            data = data.T  # Transpose to (samples, channels)

        print(f"Transposed data shape for Kilosort4: {data.shape}")

        # Save to temporary binary file
        import tempfile
        temp_bin = tempfile.NamedTemporaryFile(delete=False, suffix='.bin')
        data_c = np.ascontiguousarray(data)
        data_c.tofile(temp_bin.name)
        temp_bin.close()

        print(f"Saved temporary binary file: {temp_bin.name}")

        # Settings for Kilosort4
        settings = {
            "n_chan_bin": data.shape[1],  # number of channels
            "fs": sampling_rate,
            "filename": temp_bin.name,
            "batch_size": 60000,  # Reduce batch size to use less memory (default is higher)
            "nblocks": 1  # Process in smaller blocks to reduce memory usage
        }

        # Load probe
        probe = load_probe(probe_path)

        # Determine device
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {device}")

        # Change to temp directory to prevent Kilosort from writing to project dir
        # This prevents Flask auto-reload from being triggered
        original_cwd = os.getcwd()
        temp_results_dir = tempfile.mkdtemp(prefix='kilosort4_')

        try:
            os.chdir(temp_results_dir)
            print(f"Running in temporary directory: {temp_results_dir}")

            # Create and run pipeline
            pipeline = KS4Pipeline(
                settings=settings,
                probe=probe,
                device=device
            )

            print("Running Kilosort4 pipeline...")
            with torch.no_grad():
                out = pipeline()
        finally:
            # Always restore working directory
            os.chdir(original_cwd)
            # Clean up temp results directory
            try:
                import shutil
                shutil.rmtree(temp_results_dir)
            except:
                pass

        # Extract results
        spike_times_samples = out["st"][:, 0]  # First column is time in samples
        spike_clusters = out["clu"]  # Cluster assignments
        n_spikes = out["st"].shape[0]
        n_clusters = np.unique(spike_clusters).size

        print(f"\n{'='*60}")
        print(f"Kilosort4 Results:")
        print(f"{'='*60}")
        print(f"Number of clusters: {n_clusters}")
        print(f"Number of detected spikes: {n_spikes}")

        # Store results in format compatible with frontend
        self._store_kilosort4_results(spike_times_samples, spike_clusters, out)

        # Clean up temporary file
        try:
            os.unlink(temp_bin.name)
        except:
            pass

        # Build response with full clustering results for frontend
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
            # Include full clustering results for immediate visualization
            'available': True,
            'totalSpikes': int(n_spikes),
            'fullData': self.clustering_results
        }
        
        print(f"Kilosort4 response includes:")
        print(f"  - available: {response['available']}")
        print(f"  - fullData clusters: {len(response['fullData'])}")
        print(f"  - fullData total spikes: {sum(len(c) for c in response['fullData'])}")

        return response

    def _store_kilosort4_results(self, spike_times, spike_clusters, kilosort_output):
        """Store Kilosort4 results with PCA transformation"""
        from sklearn.decomposition import PCA

        # Group spikes by cluster
        unique_clusters = np.unique(spike_clusters)
        self.clustering_results = []

        print(f"Processing all {len(spike_times)} spikes across {len(unique_clusters)} clusters...")

        # Extract waveforms for PCA - include ALL spikes
        all_spike_waveforms = []
        all_spike_channels = []  # Store peak channel for each spike
        cluster_sizes = []

        for cluster_id in unique_clusters:
            cluster_mask = spike_clusters == cluster_id
            cluster_times = spike_times[cluster_mask]

            # Extract waveforms and determine peak channel for ALL spikes in cluster
            waveforms = []
            peak_channels = []
            
            for spike_time in cluster_times:
                spike_sample = int(spike_time)
                # Extract small window around spike (±15 samples = 30 total)
                window_size = 15
                if window_size < spike_sample < self.dataset_manager.data_array.shape[1] - window_size:
                    # Get waveform snippet from all channels
                    window = self.dataset_manager.data_array[:, spike_sample-window_size:spike_sample+window_size]
                    
                    # Determine peak channel: channel with maximum deviation from baseline
                    # Remove DC offset by subtracting mean of each channel's window
                    window_baseline_corrected = window - np.mean(window, axis=1, keepdims=True)
                    # Use maximum absolute value as the signal strength
                    channel_amplitudes = np.max(np.abs(window_baseline_corrected), axis=1)
                    peak_channel = int(np.argmax(channel_amplitudes)) + 1  # +1 for 1-indexed
                    
                    waveforms.append(window.flatten())
                    peak_channels.append(peak_channel)

            if len(waveforms) > 0:
                all_spike_waveforms.extend(waveforms)
                all_spike_channels.extend(peak_channels)
                cluster_sizes.append(len(waveforms))

        # Apply PCA with optimization for large datasets
        if len(all_spike_waveforms) > 0:
            all_waveforms_array = np.array(all_spike_waveforms)
            pca = PCA(n_components=2)
            
            # Optimize: If we have many spikes, fit PCA on a sample, then transform all
            if len(all_spike_waveforms) > 5000:
                print(f"Optimizing PCA: Fitting on 5000 sample spikes, transforming all {len(all_spike_waveforms)}...")
                # Randomly sample spikes for PCA fitting
                sample_indices = np.random.choice(len(all_spike_waveforms), 5000, replace=False)
                sample_waveforms = all_waveforms_array[sample_indices]
                
                # Fit PCA on sample (fast)
                pca.fit(sample_waveforms)
                
                # Transform all spikes using the fitted PCA (much faster than fit_transform)
                pca_coords = pca.transform(all_waveforms_array)
                print(f"✓ PCA completed in optimized mode")
            else:
                print(f"Applying PCA to {len(all_spike_waveforms)} spike waveforms...")
                pca_coords = pca.fit_transform(all_waveforms_array)
                print(f"✓ PCA completed")

            # Split PCA coords by cluster
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
                        'channel': peak_channel,  # Use calculated peak channel
                        'time': int(spike_time),
                        'spikeIndex': i
                    }
                    cluster_data.append(spike_data)

                self.clustering_results.append(cluster_data)
                start_idx += size
                channel_idx += size

        total_spikes_stored = sum(len(cluster) for cluster in self.clustering_results)
        print(f"✓ Stored Kilosort4 results: {len(self.clustering_results)} clusters, {total_spikes_stored} spikes")

    def _store_clustering_results(self, clusters, centroids, clusters_meta):
        """Store clustering results with PCA transformation"""
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
        
        print(f"✓ Stored clustering results: {len(self.clustering_results)} clusters")
    
    def get_cluster_data(self, mode: str, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Get cluster data for visualization"""
        # First check if we have stored clustering results from JimsAlgorithm or Kilosort4
        if self.clustering_results is not None:
            print(f"Using stored clustering results from spike sorting algorithm ({len(self.clustering_results)} clusters)")
            return self._get_stored_clustering_data(channel_mapping)
        
        if mode == 'real':
            return self._get_real_cluster_data(channel_mapping)
        else:
            return self._get_synthetic_cluster_data(channel_mapping)
    
    def _get_stored_clustering_data(self, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Format stored clustering results for visualization"""
        clusters = []
        total_points = 0
        
        for cluster_idx, cluster_spikes in enumerate(self.clustering_results):
            if not cluster_spikes:
                continue
            
            # Extract x, y coordinates and spike times from stored results
            points = [[spike['x'], spike['y']] for spike in cluster_spikes]
            spike_times = [spike['time'] for spike in cluster_spikes]
            
            # Determine channel from the spike data
            channels = [spike['channel'] for spike in cluster_spikes]
            peak_channel = max(set(channels), key=channels.count) if channels else 181
            
            # Use channel from mapping if available
            channel_id = channel_mapping.get(str(cluster_idx), peak_channel)
            
            # Generate color for this cluster
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
        
        print(f"Prepared {len(clusters)} clusters from stored results for visualization")
        
        return {
            'mode': 'algorithm_results',
            'clusters': clusters,
            'numClusters': len(clusters),
            'totalPoints': total_points,
            'clusterIds': list(range(len(clusters)))
        }
    
    def _get_real_cluster_data(self, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Load real cluster data from file"""
        cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time.npy')
        if not os.path.exists(cluster_file):
            cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
            if not os.path.exists(cluster_file):
                raise FileNotFoundError('Cluster data file not found in labels folder')
        
        print(f"Loading real cluster data from: {cluster_file}")
        spikes_arr = np.load(cluster_file)
        
        xy_coordinates = spikes_arr[:, :2]
        cluster_ids = spikes_arr[:, 2].astype(np.int64)
        times_secs = spikes_arr[:, 3]
        sampling_frequency = 30000
        times_indices = (times_secs * sampling_frequency).astype(np.int64)
        
        unique_cluster_ids = np.unique(cluster_ids)
        print(f"Found {len(unique_cluster_ids)} unique clusters with {len(cluster_ids)} total points")
        
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
        
        print(f"Prepared {len(clusters)} clusters for visualization")
        
        return {
            'mode': 'real',
            'clusters': clusters,
            'numClusters': len(clusters),
            'totalPoints': len(cluster_ids),
            'clusterIds': unique_cluster_ids.tolist()
        }
    
    def _get_synthetic_cluster_data(self, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Generate synthetic cluster data"""
        channel_ids = [179, 181, 183]
        np.random.seed(42)
        clusters = []
        colors = ['#FF6B6B', '#4ECDC4', '#FFD700']
        centers = [[2.0, 5.0], [8.0, 2.5], [4.0, 2.0]]
        spreads = [0.8, 0.9, 0.7]
        
        for cluster_idx in range(3):
            cluster_x = np.random.normal(centers[cluster_idx][0], spreads[cluster_idx], 100)
            cluster_y = np.random.normal(centers[cluster_idx][1], spreads[cluster_idx], 100)
            
            spike_times = []
            clusters.append({
                'clusterId': cluster_idx,
                'points': [[float(x), float(y)] for x, y in zip(cluster_x, cluster_y)],
                'spikeTimes': spike_times,
                'center': centers[cluster_idx],
                'color': colors[cluster_idx],
                'channelId': channel_ids[cluster_idx] if cluster_idx < len(channel_ids) else None,
                'pointCount': 100
            })
        
        print(f"Generated synthetic cluster data for channels: {channel_ids}")
        
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
        """Generate a color for a cluster using HSV color space"""
        golden_ratio = 0.618033988749895
        hue = (cluster_idx * golden_ratio) % 1.0
        saturation = 0.7 + (cluster_idx % 3) * 0.1
        value = 0.85 + (cluster_idx % 2) * 0.1

        r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
        return f'#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}'


class SpikeVisualizerAPI:
    """Main API application class"""
    
    def __init__(self):
        self.config = Config()
        self._setup_directories()
        
        self.dataset_manager = DatasetManager(self.config)
        self.mapping_manager = LabelMappingManager(self.config)
        self.spike_times_manager = SpikeTimesManager(self.config, self.mapping_manager)
        self.spike_data_processor = SpikeDataProcessor(self.dataset_manager, self.spike_times_manager)
        self.clustering_manager = ClusteringManager(self.config, self.dataset_manager)
        
        self.app = Flask(__name__)
        CORS(self.app)
        self.app.config['MAX_CONTENT_LENGTH'] = self.config.MAX_CONTENT_LENGTH
        
        self._register_routes()
    
    def _setup_directories(self):
        """Create necessary directories"""
        os.makedirs(self.config.DATASETS_FOLDER, exist_ok=True)
        os.makedirs(self.config.LABELS_FOLDER, exist_ok=True)
    
    def _register_routes(self):
        """Register all API routes"""
        self.app.route('/api/dataset-info', methods=['GET'])(self.get_dataset_info)
        self.app.route('/api/spike-data', methods=['POST'])(self.get_spike_data)
        self.app.route('/api/spike-times-available', methods=['GET'])(self.spike_times_available)
        self.app.route('/api/navigate-spike', methods=['POST'])(self.navigate_spike)
        self.app.route('/api/datasets', methods=['GET'])(self.list_datasets)
        self.app.route('/api/dataset/set', methods=['POST'])(self.set_current_dataset)
        self.app.route('/api/dataset/upload', methods=['POST'])(self.upload_dataset)
        self.app.route('/api/dataset/delete', methods=['DELETE'])(self.delete_dataset)
        self.app.route('/api/label-mappings', methods=['GET'])(self.get_label_mappings)
        self.app.route('/api/label-mappings', methods=['POST'])(self.add_mapping)
        self.app.route('/api/label-mappings/<dataset_name>', methods=['DELETE'])(self.delete_mapping)
        self.app.route('/api/cluster-data', methods=['POST'])(self.get_cluster_data)
        self.app.route('/api/spike-preview', methods=['POST'])(self.get_spike_preview)
        self.app.route('/api/cluster-statistics', methods=['POST'])(self.get_cluster_statistics)
        self.app.route('/api/cluster-waveforms', methods=['POST'])(self.get_cluster_waveforms)
        self.app.route('/api/cluster-multi-channel-waveforms', methods=['POST'])(self.get_cluster_multi_channel_waveforms)
        self.app.route('/api/spike-sorting/algorithms', methods=['GET'])(self.list_spike_sorting_algorithms)
        self.app.route('/api/spike-sorting/run', methods=['POST'])(self.run_spike_sorting)
        self.app.route('/api/clustering-results', methods=['GET'])(self.get_clustering_results)
    
    def get_dataset_info(self):
        """Get dataset information"""
        try:
            if self.dataset_manager.data_array is None:
                return jsonify({'error': 'Data not loaded'}), 500
            
            return jsonify({
                'totalChannels': self.dataset_manager.data_array.shape[0],
                'totalDataPoints': int(self.dataset_manager.data_array.shape[1]),
                'maxTimeRange': int(self.dataset_manager.data_array.shape[1])
            })
        except Exception as e:
            print(f"Error in get_dataset_info: {e}")
            return jsonify({'error': str(e)}), 500
    
    def get_spike_data(self):
        """Get spike data for channels"""
        try:
            data = request.get_json()
            channels = data.get('channels', [])
            spike_threshold = data.get('spikeThreshold')
            invert_data = data.get('invertData', False)
            start_time = data.get('startTime', 0)
            end_time = data.get('endTime', 20000)
            use_precomputed = data.get('usePrecomputed', False)
            data_type = data.get('dataType', 'raw')
            filter_type = data.get('filterType', 'highpass')
            
            max_points = 20000
            end_time = min(end_time, start_time + max_points)
            
            if use_precomputed and self.spike_times_manager.spike_times_data is not None:
                spike_data = self.spike_data_processor.get_precomputed_spike_data(
                    channels, start_time, end_time, filter_type, invert_data, data_type
                )
            else:
                spike_data = self.spike_data_processor.get_real_data(
                    channels, spike_threshold, invert_data, start_time, end_time, data_type, filter_type
                )
            
            return jsonify(spike_data)
        except Exception as e:
            print(f"Error in get_spike_data: {e}")
            return jsonify({'error': str(e)}), 500
    
    def spike_times_available(self):
        """Check if spike times are available"""
        try:
            info = self.spike_times_manager.get_spike_times_info()
            return jsonify(info)
        except Exception as e:
            print(f"Error checking spike times: {e}")
            return jsonify({'error': str(e)}), 500
    
    def navigate_spike(self):
        """Navigate to next or previous spike"""
        try:
            data = request.get_json()
            current_time = data.get('currentTime', 0)
            direction = data.get('direction', 'next')
            channels = data.get('channels', [])
            
            result = self.spike_times_manager.navigate_spike(current_time, direction, channels)
            
            if result is None:
                return jsonify({'error': 'No spike found'}), 404
            
            spike_time, total_spikes = result
            return jsonify({
                'spikeTime': spike_time,
                'totalSpikes': total_spikes
            })
        except Exception as e:
            print(f"Error in navigate_spike: {e}")
            return jsonify({'error': str(e)}), 500
    
    def list_datasets(self):
        """List all available datasets"""
        try:
            datasets = []
            label_files = set()
            
            if os.path.exists(self.config.LABELS_FOLDER):
                for filename in os.listdir(self.config.LABELS_FOLDER):
                    if filename.endswith('.pt'):
                        label_files.add(filename)
            
            if os.path.exists(self.config.DATASETS_FOLDER):
                for filename in os.listdir(self.config.DATASETS_FOLDER):
                    if self._allowed_file(filename) and filename not in label_files:
                        filepath = os.path.join(self.config.DATASETS_FOLDER, filename)
                        if os.path.isfile(filepath):
                            file_size = os.path.getsize(filepath)
                            datasets.append({
                                'name': filename,
                                'size': file_size,
                                'sizeFormatted': self._format_file_size(file_size)
                            })
            
            return jsonify({
                'datasets': datasets,
                'current': self.dataset_manager.current_dataset
            })
        except Exception as e:
            print(f"Error listing datasets: {e}")
            return jsonify({'error': str(e)}), 500
    
    def set_current_dataset(self):
        """Set the current active dataset"""
        try:
            data = request.get_json()
            dataset_name = data.get('dataset')
            
            if not dataset_name:
                return jsonify({'error': 'No dataset name provided'}), 400
            
            result = self.dataset_manager.load_data(dataset_name)
            
            if result is None:
                return jsonify({'error': 'Failed to load dataset'}), 500
            
            self.spike_times_manager.load_spike_times(dataset_name)
            
            return jsonify({
                'success': True,
                'dataset': dataset_name,
                'totalChannels': self.dataset_manager.data_array.shape[0],
                'totalDataPoints': int(self.dataset_manager.data_array.shape[1])
            })
        except Exception as e:
            print(f"Error setting dataset: {e}")
            return jsonify({'error': str(e)}), 500
    
    def upload_dataset(self):
        """Upload a new dataset file"""
        try:
            if 'file' not in request.files:
                return jsonify({'error': 'No file provided'}), 400
            
            file = request.files['file']
            
            if file.filename == '':
                return jsonify({'error': 'No file selected'}), 400
            
            if not self._allowed_file(file.filename):
                return jsonify({'error': f'File type not allowed. Allowed types: {", ".join(self.config.ALLOWED_EXTENSIONS)}'}), 400
            
            filename = secure_filename(file.filename)
            filepath = os.path.join(self.config.DATASETS_FOLDER, filename)
            
            chunk_size = 4096 * 1024
            with open(filepath, 'wb') as f:
                while True:
                    chunk = file.stream.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
            
            file_size = os.path.getsize(filepath)
            print(f"Uploaded dataset: {filename} ({self._format_file_size(file_size)})")
            
            spike_times_filename = None
            if 'spike_times_file' in request.files:
                spike_times_file = request.files['spike_times_file']
                if spike_times_file.filename != '' and spike_times_file.filename.endswith('.pt'):
                    spike_times_filename = secure_filename(spike_times_file.filename)
                    spike_times_filepath = os.path.join(self.config.LABELS_FOLDER, spike_times_filename)
                    
                    with open(spike_times_filepath, 'wb') as f:
                        while True:
                            chunk = spike_times_file.stream.read(chunk_size)
                            if not chunk:
                                break
                            f.write(chunk)
                    
                    print(f"Uploaded spike times to labels folder: {spike_times_filename}")
                    self.mapping_manager.add_mapping(filename, spike_times_filename)
            
            return jsonify({
                'success': True,
                'filename': filename,
                'size': file_size,
                'sizeFormatted': self._format_file_size(file_size),
                'spikeTimesFile': spike_times_filename
            })
        except Exception as e:
            print(f"Error uploading dataset: {e}")
            return jsonify({'error': str(e)}), 500
    
    def delete_dataset(self):
        """Delete a dataset file"""
        try:
            data = request.get_json()
            dataset_name = data.get('dataset')
            
            if not dataset_name:
                return jsonify({'error': 'No dataset name provided'}), 400
            
            filename = secure_filename(dataset_name)
            filepath = os.path.join(self.config.DATASETS_FOLDER, filename)
            
            if not os.path.exists(filepath):
                return jsonify({'error': 'Dataset not found'}), 404
            
            if dataset_name == self.dataset_manager.current_dataset:
                other_datasets = []
                if os.path.exists(self.config.DATASETS_FOLDER):
                    for f in os.listdir(self.config.DATASETS_FOLDER):
                        if self._allowed_file(f) and f != filename:
                            other_datasets.append(f)
                
                if other_datasets:
                    new_dataset = other_datasets[0]
                    print(f"Switching from {dataset_name} to {new_dataset} before deletion")
                    self.dataset_manager.load_data(new_dataset)
                    self.spike_times_manager.load_spike_times(new_dataset)
                else:
                    self.dataset_manager.data_array = None
                    self.dataset_manager.current_dataset = None
            
            os.remove(filepath)
            
            label_filename = self.mapping_manager.get_mapping(dataset_name)
            if label_filename:
                label_path = os.path.join(self.config.LABELS_FOLDER, label_filename)
                if os.path.exists(label_path):
                    try:
                        os.remove(label_path)
                        print(f"Deleted associated label file: {label_filename}")
                    except Exception as e:
                        print(f"Error deleting label file: {e}")
                
                self.mapping_manager.remove_mapping(dataset_name)
            
            print(f"Deleted dataset: {filename}")
            
            return jsonify({
                'success': True,
                'message': f'Dataset {filename} deleted successfully',
                'newCurrentDataset': self.dataset_manager.current_dataset
            })
        except Exception as e:
            print(f"Error deleting dataset: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    def get_label_mappings(self):
        """Get all dataset-to-label mappings"""
        try:
            return jsonify({
                'mappings': self.mapping_manager.mappings,
                'count': len(self.mapping_manager.mappings)
            })
        except Exception as e:
            print(f"Error getting mappings: {e}")
            return jsonify({'error': str(e)}), 500
    
    def add_mapping(self):
        """Add or update a dataset-to-label mapping"""
        try:
            data = request.get_json()
            dataset_name = data.get('dataset')
            label_name = data.get('label')
            
            if not dataset_name or not label_name:
                return jsonify({'error': 'Both dataset and label names are required'}), 400
            
            self.mapping_manager.add_mapping(dataset_name, label_name)
            
            if dataset_name == self.dataset_manager.current_dataset:
                self.spike_times_manager.load_spike_times(dataset_name)
            
            return jsonify({
                'success': True,
                'message': f'Mapping added: {dataset_name} -> {label_name}'
            })
        except Exception as e:
            print(f"Error adding mapping: {e}")
            return jsonify({'error': str(e)}), 500
    
    def delete_mapping(self, dataset_name):
        """Remove a dataset-to-label mapping"""
        try:
            if dataset_name not in self.mapping_manager.mappings:
                return jsonify({'error': 'Mapping not found'}), 404
            
            self.mapping_manager.remove_mapping(dataset_name)
            
            return jsonify({
                'success': True,
                'message': f'Mapping removed for: {dataset_name}'
            })
        except Exception as e:
            print(f"Error removing mapping: {e}")
            return jsonify({'error': str(e)}), 500
    
    def get_cluster_data(self):
        """Get cluster data for visualization"""
        try:
            data = request.get_json()
            mode = data.get('mode', 'synthetic')
            channel_mapping = data.get('channelMapping', {})
            
            result = self.clustering_manager.get_cluster_data(mode, channel_mapping)
            return jsonify(result)
        except Exception as e:
            print(f"Error getting cluster data: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    def get_spike_preview(self):
        """Get waveform preview for a specific spike"""
        try:
            data = request.get_json()
            spike_time = data.get('spikeTime')
            channel_id = data.get('channelId', 1)
            window = data.get('window', 10)
            filter_type = data.get('filterType', 'highpass')
            point_index = data.get('pointIndex', 0)
            
            if spike_time is None:
                return jsonify({'error': 'No spike time provided'}), 400
            
            if self.dataset_manager.data_array is None:
                return jsonify({'error': 'No data loaded'}), 400
            
            spike_time = int(spike_time)
            array_index = channel_id - 1
            
            if array_index >= self.dataset_manager.data_array.shape[0] or array_index < 0:
                return jsonify({'error': 'Invalid channel'}), 400
            
            channel_data = self.dataset_manager.data_array[array_index, :]
            
            if filter_type != 'none':
                try:
                    filtered_channel = FilterProcessor.apply_filter(channel_data.astype(float), filter_type=filter_type)
                except:
                    print(f"Warning: Filter failed, using raw data")
                    filtered_channel = channel_data
            else:
                filtered_channel = channel_data
            
            start_idx = max(0, spike_time - window)
            end_idx = min(len(filtered_channel), spike_time + window + 1)
            waveform = filtered_channel[start_idx:end_idx]
            waveform = np.round(waveform).astype(int)
            
            return jsonify({
                'waveform': waveform.tolist(),
                'pointIndex': point_index,
                'spikeTime': spike_time,
                'channelId': channel_id,
                'window': window,
                'filterType': filter_type
            })
        except Exception as e:
            print(f"Error getting spike preview: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    def get_cluster_statistics(self):
        """Get statistics for specified clusters"""
        try:
            data = request.get_json()
            cluster_ids = data.get('clusterIds', [])
            algorithm = data.get('algorithm', 'preprocessed_kilosort')
            
            if not cluster_ids:
                return jsonify({'statistics': {}})
            
            statistics = {}
            
            if algorithm in ['torchbci_jims', 'kilosort4'] and self.clustering_manager.clustering_results is not None:
                statistics = self._calculate_jims_statistics(cluster_ids)
            else:
                statistics = self._calculate_kilosort_statistics(cluster_ids)
            
            return jsonify({'statistics': statistics})
        except Exception as e:
            print(f"Error getting cluster statistics: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    def _calculate_jims_statistics(self, cluster_ids: List[int]) -> Dict[int, Dict]:
        """Calculate statistics for JimsAlgorithm clusters"""
        statistics = {}
        
        for cluster_id in cluster_ids:
            if cluster_id >= len(self.clustering_manager.clustering_results):
                continue
            
            cluster_spikes = self.clustering_manager.clustering_results[cluster_id]
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
    
    def _calculate_kilosort_statistics(self, cluster_ids: List[int]) -> Dict[int, Dict]:
        """Calculate statistics for Kilosort clusters"""
        cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time.npy')
        if not os.path.exists(cluster_file):
            cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
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
    
    def get_cluster_waveforms(self):
        """Get waveforms for specified clusters"""
        try:
            data = request.get_json()
            cluster_ids = data.get('clusterIds', [])
            max_waveforms = data.get('maxWaveforms', 100)
            window_size = data.get('windowSize', 30)
            algorithm = data.get('algorithm', 'preprocessed_kilosort')
            
            if not cluster_ids or self.dataset_manager.data_array is None:
                return jsonify({'waveforms': {}})
            
            if algorithm in ['torchbci_jims', 'kilosort4'] and self.clustering_manager.clustering_results is not None:
                waveforms_data = self._get_jims_waveforms(cluster_ids, max_waveforms, window_size)
            else:
                waveforms_data = self._get_kilosort_waveforms(cluster_ids, max_waveforms, window_size)
            
            return jsonify({'waveforms': waveforms_data})
        except Exception as e:
            print(f"Error getting cluster waveforms: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    def _get_jims_waveforms(self, cluster_ids: List[int], max_waveforms: int, 
                           window_size: int) -> Dict[int, List]:
        """Get waveforms for JimsAlgorithm clusters"""
        waveforms_data = {}
        
        for cluster_id in cluster_ids:
            if cluster_id >= len(self.clustering_manager.clustering_results):
                continue
            
            cluster_spikes = self.clustering_manager.clustering_results[cluster_id]
            
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
                end_idx = min(self.dataset_manager.data_array.shape[1], int(spike_time) + window_size)
                
                if start_idx < end_idx and 0 <= channel_idx < self.dataset_manager.data_array.shape[0]:
                    waveform = self.dataset_manager.data_array[channel_idx, start_idx:end_idx].astype(float)
                    
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
    
    def _get_kilosort_waveforms(self, cluster_ids: List[int], max_waveforms: int,
                               window_size: int) -> Dict[int, List]:
        """Get waveforms for Kilosort clusters"""
        cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time.npy')
        if not os.path.exists(cluster_file):
            cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
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
                end_idx = min(self.dataset_manager.data_array.shape[1], int(spike_time) + window_size)
                
                if start_idx < end_idx:
                    waveform = self.dataset_manager.data_array[channel_idx, start_idx:end_idx].astype(float)
                    
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
    
    def get_cluster_multi_channel_waveforms(self):
        """Get multi-channel waveforms for a cluster"""
        try:
            data = request.get_json()
            cluster_id = data.get('clusterId')
            max_waveforms = data.get('maxWaveforms', 50)
            window_size = data.get('windowSize', 30)
            algorithm = data.get('algorithm', 'preprocessed_kilosort')
            
            if cluster_id is None or self.dataset_manager.data_array is None:
                return jsonify({'error': 'Invalid cluster ID or no data loaded'}), 400
            
            spike_times, spike_channels = self._get_cluster_spike_info(cluster_id, algorithm)
            
            if not spike_times:
                return jsonify({'error': 'No spikes found for this cluster'}), 404
            
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
                
                if channel_idx < 0 or channel_idx >= self.dataset_manager.data_array.shape[0]:
                    continue
                
                waveforms = []
                for spike_time in selected_times:
                    start_idx = max(0, int(spike_time) - window_size)
                    end_idx = min(self.dataset_manager.data_array.shape[1], int(spike_time) + window_size)
                    
                    if start_idx < end_idx:
                        waveform = self.dataset_manager.data_array[channel_idx, start_idx:end_idx].astype(float)
                        
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
            print(f"Error getting multi-channel waveforms: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    def _get_cluster_spike_info(self, cluster_id: int, algorithm: str) -> Tuple[List[int], List[int]]:
        """Get spike times and channels for a cluster"""
        spike_times = []
        spike_channels = []
        
        if algorithm in ['torchbci_jims', 'kilosort4'] and self.clustering_manager.clustering_results is not None:
            if cluster_id >= len(self.clustering_manager.clustering_results):
                return spike_times, spike_channels
            
            cluster_spikes = self.clustering_manager.clustering_results[cluster_id]
            for spike in cluster_spikes:
                spike_times.append(int(spike['time']))
                spike_channels.append(int(spike['channel']))
        else:
            cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time.npy')
            if not os.path.exists(cluster_file):
                cluster_file = os.path.join(self.config.LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
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
    
    def list_spike_sorting_algorithms(self):
        """List all available spike sorting algorithms"""
        algorithms = [
            {
                'name': 'preprocessed_kilosort',
                'displayName': 'Preprocessed Kilosort',
                'description': 'Pre-computed cluster data from Kilosort',
                'available': True,
                'requiresRun': False
            }
        ]
        
        if JIMS_AVAILABLE:
            algorithms.append({
                'name': 'torchbci_jims',
                'displayName': 'TorchBCI Algorithm',
                'description': 'Jim\'s spike sorting algorithm with clustering',
                'available': True,
                'requiresRun': True
            })
        else:
            algorithms.append({
                'name': 'torchbci_jims',
                'displayName': 'TorchBCI Algorithm',
                'description': 'Jim\'s spike sorting algorithm (not installed)',
                'available': False,
                'requiresRun': True
            })

        if KILOSORT4_AVAILABLE:
            algorithms.append({
                'name': 'kilosort4',
                'displayName': 'Kilosort4',
                'description': 'State-of-the-art spike sorting with Kilosort4',
                'available': True,
                'requiresRun': True
            })
        else:
            algorithms.append({
                'name': 'kilosort4',
                'displayName': 'Kilosort4',
                'description': 'Kilosort4 spike sorting (not installed)',
                'available': False,
                'requiresRun': True
            })

        return jsonify({'algorithms': algorithms})
    
    def run_spike_sorting(self):
        """Run spike sorting algorithm"""
        try:
            request_data = request.get_json() or {}
            algorithm = request_data.get('algorithm', 'torchbci_jims')
            params = request_data.get('parameters', {})

            if algorithm == 'kilosort4':
                response = self.clustering_manager.run_kilosort4(params)
            else:
                # Default to JimsAlgorithm
                response = self.clustering_manager.run_jims_algorithm(params)

            return jsonify(response), 200
        except Exception as e:
            print(f"Error running spike sorting: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    def get_clustering_results(self):
        """Get stored clustering results"""
        if self.clustering_manager.clustering_results is None:
            return jsonify({
                'available': False,
                'message': 'No clustering results available. Run the spike sorting algorithm first.'
            }), 200
        
        try:
            cluster_summaries = []
            for cluster_idx, cluster_data in enumerate(self.clustering_manager.clustering_results):
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
                'numClusters': len(self.clustering_manager.clustering_results),
                'totalSpikes': sum(len(cluster) for cluster in self.clustering_manager.clustering_results),
                'clusters': cluster_summaries,
                'fullData': self.clustering_manager.clustering_results
            }), 200
        except Exception as e:
            print(f"Error fetching clustering results: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    @staticmethod
    def _allowed_file(filename: str) -> bool:
        """Check if file extension is allowed"""
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS
    
    @staticmethod
    def _format_file_size(size_bytes: int) -> str:
        """Format file size in human-readable format"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.2f} PB"
    
    def initialize(self):
        """Initialize the application"""
        print("=" * 60)
        print("Starting Spike Visualizer API...")
        print("=" * 60)
        
        print("\n1. Migrating existing labels...")
        self.mapping_manager.migrate_existing_labels()
        
        print("\n2. Checking spike sorting algorithms...")
        if JIMS_AVAILABLE:
            print("   ✓ TorchBCI JimsAlgorithm available")
        else:
            print("   ✗ TorchBCI JimsAlgorithm not installed")

        if KILOSORT4_AVAILABLE:
            print("   ✓ Kilosort4 available")
        else:
            print("   ✗ Kilosort4 not installed")
        
        print(f"\n3. Loading default dataset: {self.config.DEFAULT_DATASET}")
        self.dataset_manager.load_data()
        if self.dataset_manager.data_array is not None:
            self.spike_times_manager.load_spike_times(self.dataset_manager.current_dataset)
        
        print(f"\n{'='*60}")
        print("STARTUP STATUS:")
        print(f"{'='*60}")
        print(f"  Data loaded: {self.dataset_manager.data_array is not None}")
        if self.dataset_manager.data_array is not None:
            print(f"  Data shape: {self.dataset_manager.data_array.shape}")
        print(f"  Total channels: {self.dataset_manager.nrows}")
        print(f"  Current dataset: {self.dataset_manager.current_dataset}")
        print(f"  Spike times loaded: {self.spike_times_manager.spike_times_data is not None}")
        print(f"  Dataset-Label mappings: {len(self.mapping_manager.mappings)}")
        if self.mapping_manager.mappings:
            print(f"\nLabel Mappings:")
            for dataset, label in self.mapping_manager.mappings.items():
                label_path = os.path.join(self.config.LABELS_FOLDER, label)
                exists = "✓" if os.path.exists(label_path) else "✗"
                print(f"    {exists} {dataset} -> {label}")
        print("=" * 60)
        print("\nAPI Server starting on http://localhost:5000")
        print("=" * 60)
    
    def run(self):
        """Run the Flask application"""
        self.app.run(debug=True, host='0.0.0.0', port=5000)


if __name__ == '__main__':
    api = SpikeVisualizerAPI()
    api.initialize()
    api.run()
