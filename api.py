from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import json
import os
import sys
from werkzeug.utils import secure_filename
import torch
from scipy.signal import butter, filtfilt

# Add torchbci folder to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'torchbci'))

# Try to import JimsAlgorithm from local torchbci folder
try:
    from torchbci.algorithms import JimsAlgorithm
    JIMS_AVAILABLE = True
    print("✓ Successfully imported JimsAlgorithm from local torchbci folder")
except ImportError as e:
    JIMS_AVAILABLE = False
    print(f"Warning: torchbci not available. Error: {e}")

app = Flask(__name__)
CORS(app)

DATASETS_FOLDER = 'datasets'
LABELS_FOLDER = os.path.join('datasets', 'labels')
MAPPING_DB_PATH = os.path.join('datasets', 'dataset_labels_mapping.json')
ALLOWED_EXTENSIONS = {'bin', 'dat', 'raw', 'pt'}
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 * 1024

os.makedirs(DATASETS_FOLDER, exist_ok=True)
os.makedirs(LABELS_FOLDER, exist_ok=True)

data_array = None
nrows = 385
current_dataset = 'c46_data_5percent.pt'
spike_times_data = None
dataset_label_mapping = {}

# Clustering results storage
clustering_results = None  # Will store combined clustering data per cluster

def load_mapping_database():
    """Load the dataset-to-label mapping database"""
    global dataset_label_mapping
    
    if os.path.exists(MAPPING_DB_PATH):
        try:
            with open(MAPPING_DB_PATH, 'r') as f:
                dataset_label_mapping = json.load(f)
            print(f"Loaded mapping database: {len(dataset_label_mapping)} entries")
        except Exception as e:
            print(f"Error loading mapping database: {e}")
            dataset_label_mapping = {}
    else:
        dataset_label_mapping = {}
        save_mapping_database()

def save_mapping_database():
    """Save the dataset-to-label mapping database"""
    try:
        with open(MAPPING_DB_PATH, 'w') as f:
            json.dump(dataset_label_mapping, f, indent=2)
        print(f"Saved mapping database: {len(dataset_label_mapping)} entries")
    except Exception as e:
        print(f"Error saving mapping database: {e}")

def add_label_mapping(dataset_name, label_filename):
    """Add or update a dataset-to-label mapping"""
    global dataset_label_mapping
    dataset_label_mapping[dataset_name] = label_filename
    save_mapping_database()
    print(f"Added mapping: {dataset_name} -> {label_filename}")

def get_label_filename(dataset_name):
    """Get the label filename for a given dataset"""
    return dataset_label_mapping.get(dataset_name)

def remove_label_mapping(dataset_name):
    """Remove a dataset-to-label mapping"""
    global dataset_label_mapping
    if dataset_name in dataset_label_mapping:
        del dataset_label_mapping[dataset_name]
        save_mapping_database()
        print(f"Removed mapping for: {dataset_name}")

def migrate_existing_labels():
    """Move any spike time files from datasets to datasets/labels folder and auto-detect mappings"""
    if not os.path.exists(DATASETS_FOLDER):
        return
    
    label_patterns = ['_spike_times.pt', '_spikes.pt', '_times.pt', '_labels']
    
    for filename in os.listdir(DATASETS_FOLDER):
        if any(pattern in filename for pattern in label_patterns) and filename.endswith('.pt'):
            old_path = os.path.join(DATASETS_FOLDER, filename)
            new_path = os.path.join(LABELS_FOLDER, filename)
            if os.path.isfile(old_path) and not os.path.exists(new_path):
                try:
                    import shutil
                    shutil.move(old_path, new_path)
                    print(f"Migrated label file: {filename} -> datasets/labels/")
                    
                    base_name = filename.replace('_labels', '_data').replace('_spike_times', '').replace('_spikes', '').replace('_times', '')
                    if not base_name.endswith('.pt'):
                        base_name = base_name + '.pt'
                    
                    dataset_path = os.path.join(DATASETS_FOLDER, base_name)
                    if os.path.exists(dataset_path):
                        add_label_mapping(base_name, filename)
                        print(f"Auto-detected mapping: {base_name} -> {filename}")
                        
                except Exception as e:
                    print(f"Error migrating {filename}: {e}")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def apply_filter(data, filter_type='highpass', sampling_rate=30000, order=4):
    """
    Apply various types of Butterworth filters to the signal
    
    Args:
        data: 1D numpy array of signal data
        filter_type: type of filter ('highpass', 'lowpass', 'bandpass')
        sampling_rate: sampling rate of the signal in Hz (default 30 kHz)
        order: order of the Butterworth filter (default 4)
    
    Returns:
        filtered_data: 1D numpy array of filtered signal
    """
    try:
        nyquist = sampling_rate / 2.0
        
        if filter_type == 'highpass':
            # High-pass: remove low frequencies (< 300 Hz)
            cutoff_freq = 300
            normalized_cutoff = cutoff_freq / nyquist
            b, a = butter(order, normalized_cutoff, btype='high', analog=False)
            
        elif filter_type == 'lowpass':
            # Low-pass: remove high frequencies (> 3000 Hz)
            cutoff_freq = 3000
            normalized_cutoff = cutoff_freq / nyquist
            b, a = butter(order, normalized_cutoff, btype='low', analog=False)
            
        elif filter_type == 'bandpass':
            # Band-pass: keep frequencies between 300-3000 Hz
            low_cutoff = 300
            high_cutoff = 3000
            low_normalized = low_cutoff / nyquist
            high_normalized = high_cutoff / nyquist
            b, a = butter(order, [low_normalized, high_normalized], btype='band', analog=False)
            
        else:
            # Unknown filter type, return original data
            print(f"Unknown filter type: {filter_type}")
            return data
        
        # Apply the filter using filtfilt for zero-phase filtering
        filtered_data = filtfilt(b, a, data)
        
        return filtered_data
    except Exception as e:
        print(f"Error applying {filter_type} filter: {e}")
        return data  # Return original data if filtering fails

def load_spike_times(dataset_filename):
    """Load spike times file associated with a dataset using the mapping database"""
    global spike_times_data
    
    print(f"\n=== Loading spike times for: {dataset_filename} ===")
    spike_times_data = None
    
    label_filename = get_label_filename(dataset_filename)
    print(f"Label filename from mapping: {label_filename}")
    
    if not label_filename:
        print(f"❌ No label mapping found for dataset: {dataset_filename}")
        print(f"Available mappings: {list(dataset_label_mapping.keys())}")
        return False
    
    spike_path = os.path.join(LABELS_FOLDER, label_filename)
    print(f"Looking for spike times at: {spike_path}")
    print(f"File exists: {os.path.exists(spike_path)}")
    
    if not os.path.exists(spike_path):
        print(f"❌ Label file not found: {spike_path}")
        print(f"LABELS_FOLDER: {LABELS_FOLDER}")
        return False
    
    try:
        print(f"📂 Loading spike times from: {spike_path}")
        loaded_data = torch.load(spike_path, weights_only=False)
        print(f"Loaded data type: {type(loaded_data)}")
        
        if isinstance(loaded_data, np.ndarray):
            spike_times_data = loaded_data
            print(f"✓ Using spike times as numpy array: {len(spike_times_data)} spikes")
        elif torch.is_tensor(loaded_data):
            spike_times_data = loaded_data.numpy()
            print(f"✓ Converted torch tensor to numpy array: {len(spike_times_data)} spikes")
        elif isinstance(loaded_data, dict):
            spike_times_data = {}
            for key in loaded_data:
                if torch.is_tensor(loaded_data[key]):
                    spike_times_data[key] = loaded_data[key].numpy()
                else:
                    spike_times_data[key] = loaded_data[key]
            print(f"✓ Using channel-specific spike times: {len(spike_times_data)} channels")
            print(f"  Channel keys: {list(spike_times_data.keys())[:10]}...")  # Show first 10
        
        print(f"✓✓✓ Spike times loaded successfully! ✓✓✓")
        print(f"spike_times_data is now: {type(spike_times_data)}")
        return True
    except Exception as e:
        print(f"❌ Error loading spike times from {spike_path}: {e}")
        import traceback
        traceback.print_exc()
        spike_times_data = None
        return False

def load_binary_data(filename=None):
    global data_array, current_dataset, nrows
    
    if filename is None:
        filename = current_dataset
    
    dataset_path = os.path.join(DATASETS_FOLDER, filename)
    if not os.path.exists(dataset_path):
        dataset_path = filename
        if not os.path.exists(dataset_path):
            print(f"Warning: {filename} not found. Using mock data.")
            return None
    
    try:
        file_ext = os.path.splitext(filename)[1].lower()
        
        if file_ext == '.pt':
            # Check for float32 version first (fastest option)
            float32_path = dataset_path.replace('.pt', '_float32.npy')
            
            if os.path.exists(float32_path):
                print(f"🚀 Found preprocessed float32 file: {float32_path}")
                print("Loading as memmap (efficient, no disk thrashing)...")
                data_array = np.load(float32_path, allow_pickle=True, mmap_mode='r')
                print(f"✓ Loaded float32 memmap: {data_array.shape}, dtype: {data_array.dtype}")
                nrows = data_array.shape[0]
                current_dataset = filename
            else:
                # Check for memory-mapped version (int16)
                npy_path = dataset_path.replace('.pt', '_mmap.npy')
                shape_path = dataset_path.replace('.pt', '_shape.txt')
                
                if os.path.exists(npy_path) and os.path.exists(shape_path):
                    print(f"🚀 Loading memory-mapped array from {npy_path}")
                    with open(shape_path, 'r') as f:
                        shape = tuple(map(int, f.read().strip().split(',')))
                    data_array = np.memmap(npy_path, dtype=np.int16, mode='r', shape=shape)
                    nrows = data_array.shape[0]
                    current_dataset = filename
                    print(f"✓ Memory-mapped data loaded: {data_array.shape}, channels: {nrows}")
                    print(f"💾 Memory usage: Minimal (~only accessed pages)")
                    print(f"💡 TIP: Convert to float32 for better JimsAlgorithm performance:")
                    print(f"    python convert_to_float32.py")
                else:
                    print(f"Loading PyTorch tensor from {dataset_path}")
                    print(f"⚠️  WARNING: Loading full {os.path.getsize(dataset_path)/(1024**3):.2f} GB into RAM")
                    print(f"💡 TIP: Convert to float32 for best performance:")
                    print(f"    python convert_to_float32.py")
                    
                    tensor_data = torch.load(dataset_path, weights_only=False)
                    
                    if torch.is_tensor(tensor_data):
                        data_array = tensor_data.numpy()
                    elif isinstance(tensor_data, np.ndarray):
                        data_array = tensor_data
                    else:
                        print(f"Error: Unexpected data type in .pt file: {type(tensor_data)}")
                        return None
                    
                    if data_array.ndim == 2:
                        if data_array.shape[0] > data_array.shape[1]:
                            print(f"Transposing data from {data_array.shape} to ({data_array.shape[1]}, {data_array.shape[0]})")
                            data_array = data_array.T
                    else:
                        print(f"Error: Expected 2D array, got shape: {data_array.shape}")
                        return None
                    
                    nrows = data_array.shape[0]
                    current_dataset = filename
                    print(f"Loaded PyTorch data from {dataset_path} with shape: {data_array.shape}, channels: {nrows}")
            
            load_spike_times(filename)
            
            return data_array
        elif file_ext == '.npy':
            # Handle .npy files - check for float32 version
            if '_float32.npy' in filename:
                # Already loading the float32 version
                print(f"Loading float32 numpy memmap from {dataset_path}")
                data_array = np.load(dataset_path, allow_pickle=True, mmap_mode='r')
                print(f"Loaded float32 memmap: {data_array.shape}, dtype: {data_array.dtype}")
            else:
                # Check if float32 version exists
                float32_path = dataset_path.replace('.npy', '_float32.npy')
                
                if os.path.exists(float32_path):
                    print(f"Found preprocessed float32 file: {float32_path}")
                    print("Loading as memmap (efficient, no disk thrashing)...")
                    data_array = np.load(float32_path, allow_pickle=True, mmap_mode='r')
                    print(f"Loaded float32 memmap with shape: {data_array.shape}, dtype: {data_array.dtype}")
                else:
                    print(f"Loading numpy memmap from {dataset_path}")
                    data_array = np.load(dataset_path, allow_pickle=True, mmap_mode='r')
                    print(f"Loaded memmap: {data_array.shape}, dtype: {data_array.dtype}")
                    
                    if data_array.dtype != np.float32:
                        print(f"💡 TIP: Convert to float32 for better performance with JimsAlgorithm:")
                        print(f"    python convert_to_float32.py")
            
            nrows = data_array.shape[0]
            current_dataset = filename
            
            print(f"Loaded numpy data from {dataset_path} with shape: {data_array.shape}, channels: {nrows}")
            
            load_spike_times(filename)
            
            return data_array
        else:
            # Handle .bin and other binary files
            binary_nrows = 385
            
            # Check if float32 preprocessed version exists
            float32_path = dataset_path.replace('.bin', '_float32.npy')
            
            if os.path.exists(float32_path):
                print(f"Found preprocessed float32 file: {float32_path}")
                print("Loading as memmap (efficient, no disk thrashing)...")
                data_array = np.load(float32_path, allow_pickle=True, mmap_mode='r')
                print(f"Loaded float32 memmap with shape: {data_array.shape}, dtype: {data_array.dtype}")
            else:
                print(f"No float32 file found. Loading int16 binary...")
                print(f"Tip: Run convert_to_float32.py to preprocess for better performance!")
                data_memmap = np.memmap(dataset_path, dtype=np.int16, mode='r')
                print(f"Binary file size: {data_memmap.shape}, reshaping with {binary_nrows} channels")
                data_array = data_memmap.reshape((-1, binary_nrows)).T
            
            nrows = data_array.shape[0]
            current_dataset = filename
            
            print(f"Loaded binary data from {dataset_path} with shape: {data_array.shape}, channels: {nrows}")
            
            load_spike_times(filename)
            
            return data_array
            
    except Exception as e:
        print(f"Error loading data: {e}")
        import traceback
        traceback.print_exc()
        return None

def get_real_data(channels, spike_threshold=None, invert_data=False, start_time=0, end_time=20000, data_type='raw', filter_type='highpass'):
    global data_array
    
    if data_array is None:
        return None
    
    total_available = data_array.shape[1]
    start_time = max(0, int(start_time))
    end_time = min(total_available, int(end_time))
    
    data = {}
    
    for channel_id in channels:
        array_index = channel_id - 1
        
        if array_index >= data_array.shape[0] or array_index < 0:
            continue
            
        channel_data = data_array[array_index, start_time:end_time]
        
        # Apply filtering if requested (for both filtered and spikes mode)
        filtered_data = None
        original_raw_data = channel_data.copy()  # Always preserve original raw data
        
        if filter_type != 'none':
            # Need a larger buffer for filtering to avoid edge effects
            buffer = 100
            buffer_start = max(0, start_time - buffer)
            buffer_end = min(total_available, end_time + buffer)
            buffered_data = data_array[array_index, buffer_start:buffer_end]
            
            # Store the baseline (mean) of the original signal
            original_mean = np.mean(channel_data)
            
            # Apply the selected filter
            filtered_buffered = apply_filter(buffered_data.astype(float), filter_type=filter_type)
            
            # Extract the relevant portion
            offset = start_time - buffer_start
            filtered_data = filtered_buffered[offset:offset + len(channel_data)]
            
            # Add back the original baseline for filters that remove DC offset
            # High-pass and band-pass filters remove DC, low-pass preserves it
            if filter_type in ['highpass', 'bandpass']:
                filtered_data = filtered_data + original_mean
            
            # For spikes mode, replace the raw data with filtered data
            # For filtered mode, keep both raw and filtered
            if data_type == 'spikes':
                channel_data = np.round(filtered_data).astype(int)
            elif data_type == 'filtered':
                # Keep original raw data and store filtered data separately
                channel_data = original_raw_data
        
        if invert_data:
            channel_data = -channel_data
            if filtered_data is not None:
                filtered_data = -filtered_data
        
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
        
        print(f"Channel {channel_id}: Sending {len(channel_data)} points (range: {start_time}-{end_time}, type: {data_type}, filter: {filter_type}, inverted: {invert_data}, peaks: {len(spike_peaks)})")
        
        data[channel_id] = {
            'data': channel_data.tolist(),
            'isSpike': is_spike if isinstance(is_spike, list) else is_spike.tolist(),
            'spikePeaks': spike_peaks,
            'channelId': channel_id,
            'startTime': start_time,
            'endTime': end_time
        }
        
        # Add filtered data if available
        if filtered_data is not None:
            data[channel_id]['filteredData'] = np.round(filtered_data).astype(int).tolist()
    
    return data

@app.route('/api/dataset-info', methods=['GET'])
def get_dataset_info():
    try:
        global data_array
        
        if data_array is None:
            return jsonify({'error': 'Data not loaded'}), 500
        
        return jsonify({
            'totalChannels': data_array.shape[0],
            'totalDataPoints': int(data_array.shape[1]),
            'maxTimeRange': int(data_array.shape[1])
        })
        
    except Exception as e:
        print(f"Error in get_dataset_info: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/spike-data', methods=['POST'])
def get_spike_data():
    try:
        data = request.get_json()
        channels = data.get('channels', [])
        spike_threshold = data.get('spikeThreshold', None)
        invert_data = data.get('invertData', False)
        start_time = data.get('startTime', 0)
        end_time = data.get('endTime', 20000)
        use_precomputed = data.get('usePrecomputed', False)
        data_type = data.get('dataType', 'raw')  # 'raw', 'filtered', or 'spikes'
        filter_type = data.get('filterType', 'highpass')  # 'none', 'highpass', 'lowpass', 'bandpass'
        
        max_points = 20000
        end_time = min(end_time, start_time + max_points)

        if use_precomputed and spike_times_data is not None:
            spike_data = get_precomputed_spike_data(channels, start_time, end_time, filter_type, invert_data, data_type)
        else:
            spike_data = get_real_data(channels, spike_threshold, invert_data, start_time, end_time, data_type, filter_type)
        
        return jsonify(spike_data)
        
    except Exception as e:
        print(f"Error in get_spike_data: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/spike-times-available', methods=['GET'])
def spike_times_available():
    try:
        is_available = spike_times_data is not None
        
        if isinstance(spike_times_data, np.ndarray):
            # Numpy array - global spike times
            spike_type = 'global'
            spike_count = len(spike_times_data)
            channels = []
        elif isinstance(spike_times_data, list):
            spike_type = 'global'
            spike_count = len(spike_times_data)
            channels = []
        elif isinstance(spike_times_data, dict):
            spike_type = 'channel_specific'
            spike_count = sum(len(v) for v in spike_times_data.values())
            channels = list(spike_times_data.keys())
        else:
            spike_type = 'none'
            spike_count = 0
            channels = []
        
        print(f"Spike times check: available={is_available}, type={spike_type}, count={spike_count}, data_type={type(spike_times_data)}")
        
        return jsonify({
            'available': is_available,
            'type': spike_type,
            'count': spike_count,
            'channels': channels
        })
    except Exception as e:
        print(f"Error checking spike times: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/navigate-spike', methods=['POST'])
def navigate_spike():
    """Find the next or previous spike time from spike_times_data"""
    global spike_times_data
    
    try:
        data = request.get_json()
        current_time = data.get('currentTime', 0)
        direction = data.get('direction', 'next')  # 'next' or 'prev'
        channels = data.get('channels', [])
        
        if spike_times_data is None:
            return jsonify({'error': 'No spike times loaded'}), 400
        
        # Collect all spike times across requested channels
        all_spikes = []
        
        if isinstance(spike_times_data, np.ndarray):
            # Global spike times (used for all channels)
            all_spikes = spike_times_data.tolist() if hasattr(spike_times_data, 'tolist') else list(spike_times_data)
        elif isinstance(spike_times_data, dict):
            # Channel-specific spike times
            for channel_id in channels:
                # Try both int and str keys since dict keys could be either
                channel_spikes = spike_times_data.get(channel_id) or spike_times_data.get(str(channel_id))
                if channel_spikes is not None:
                    if isinstance(channel_spikes, list):
                        all_spikes.extend(channel_spikes)
                    else:
                        all_spikes.extend(channel_spikes.tolist() if hasattr(channel_spikes, 'tolist') else list(channel_spikes))
        
        if not all_spikes:
            return jsonify({'error': 'No spikes found'}), 404
        
        # Sort and remove duplicates
        unique_spikes = sorted(set(all_spikes))
        
        # Find next or previous spike
        target_spike = None
        if direction == 'next':
            # Find first spike after current time
            for spike_time in unique_spikes:
                if spike_time > current_time:
                    target_spike = spike_time
                    break
            # Wrap to first spike if no spike found after current time
            if target_spike is None and unique_spikes:
                target_spike = unique_spikes[0]
        else:  # direction == 'prev'
            # Find last spike before current time
            for spike_time in reversed(unique_spikes):
                if spike_time < current_time:
                    target_spike = spike_time
                    break
            # Wrap to last spike if no spike found before current time
            if target_spike is None and unique_spikes:
                target_spike = unique_spikes[-1]
        
        if target_spike is None:
            return jsonify({'error': 'No spike found'}), 404
        
        print(f"Navigate {direction} from {current_time}: found spike at {target_spike}")
        
        return jsonify({
            'spikeTime': int(target_spike),
            'totalSpikes': len(unique_spikes)
        })
        
    except Exception as e:
        print(f"Error in navigate_spike: {e}")
        return jsonify({'error': str(e)}), 500

def get_precomputed_spike_data(channels, start_time=0, end_time=20000, filter_type='none', invert_data=False, data_type='spikes'):
    global data_array, spike_times_data
    
    if data_array is None or spike_times_data is None:
        return None
    
    total_available = data_array.shape[1]
    data = {}
    spike_window = 5

    if isinstance(spike_times_data, np.ndarray):
        all_spike_times = spike_times_data
        is_global = True
    else:
        all_spike_times = None
        is_global = False
    
    for channel_id in channels:
        array_index = channel_id - 1
        
        if array_index >= data_array.shape[0] or array_index < 0:
            continue
            
        channel_data = data_array[array_index, start_time:end_time]
        original_raw_data = channel_data.copy()  # Always preserve original raw data
        filtered_data_array = None
        
        # Apply filtering if requested
        if filter_type != 'none':
            # Need a larger buffer for filtering to avoid edge effects
            buffer = 100
            buffer_start = max(0, start_time - buffer)
            buffer_end = min(total_available, end_time + buffer)
            buffered_data = data_array[array_index, buffer_start:buffer_end]
            
            # Store the baseline (mean) of the original signal
            original_mean = np.mean(channel_data)
            
            # Apply the selected filter
            filtered_buffered = apply_filter(buffered_data.astype(float), filter_type=filter_type)
            
            # Extract the relevant portion
            offset = start_time - buffer_start
            filtered_data_array = filtered_buffered[offset:offset + len(channel_data)]
            
            # Add back the original baseline for filters that remove DC offset
            if filter_type in ['highpass', 'bandpass']:
                filtered_data_array = filtered_data_array + original_mean
            
            # For spikes mode, replace the raw data with filtered data
            # For filtered mode, keep both raw and filtered
            if data_type == 'spikes':
                channel_data = np.round(filtered_data_array).astype(int)
            elif data_type == 'filtered':
                # Keep original raw data and store filtered data separately
                channel_data = original_raw_data
        
        # Apply invert if requested
        if invert_data:
            channel_data = -channel_data
            if filtered_data_array is not None:
                filtered_data_array = -filtered_data_array
        
        if is_global:
            spike_times_list = all_spike_times
        else:
            spike_times_list = spike_times_data.get(channel_id, [])
        
        spike_peaks = [int(t - start_time) for t in spike_times_list 
                      if start_time <= t < end_time]
        
        is_spike = [False] * len(channel_data)
        for peak_idx in spike_peaks:
            for offset in range(-spike_window, spike_window + 1):
                idx = peak_idx + offset
                if 0 <= idx < len(is_spike):
                    is_spike[idx] = True
        
        print(f"Channel {channel_id}: {len(spike_peaks)} spikes (±{spike_window} window), filter={filter_type}, data_type={data_type}, global={is_global}")
        
        data[channel_id] = {
            'data': channel_data.tolist(),
            'isSpike': is_spike,
            'spikePeaks': spike_peaks,
            'channelId': channel_id,
            'startTime': start_time,
            'endTime': end_time,
            'precomputed': True
        }
        
        # Add filtered data if available (for filtered mode overlay)
        if filtered_data_array is not None and data_type == 'filtered':
            data[channel_id]['filteredData'] = np.round(filtered_data_array).astype(int).tolist()
    
    return data

@app.route('/api/datasets', methods=['GET'])
def list_datasets():
    """List all available datasets in the datasets folder"""
    try:
        datasets = []
        label_files = set()
        
        if os.path.exists(LABELS_FOLDER):
            for filename in os.listdir(LABELS_FOLDER):
                if filename.endswith('.pt'):
                    label_files.add(filename)
        
        if os.path.exists(DATASETS_FOLDER):
            for filename in os.listdir(DATASETS_FOLDER):
                if allowed_file(filename) and filename not in label_files:
                    filepath = os.path.join(DATASETS_FOLDER, filename)
                    if os.path.isfile(filepath):
                        file_size = os.path.getsize(filepath)
                        datasets.append({
                            'name': filename,
                            'size': file_size,
                            'sizeFormatted': format_file_size(file_size)
                        })
        
        for filename in ['subset_5pct.bin']:
            if os.path.exists(filename) and filename not in [d['name'] for d in datasets]:
                file_size = os.path.getsize(filename)
                datasets.append({
                    'name': filename,
                    'size': file_size,
                    'sizeFormatted': format_file_size(file_size)
                })
        
        return jsonify({
            'datasets': datasets,
            'current': current_dataset
        })
        
    except Exception as e:
        print(f"Error listing datasets: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataset/set', methods=['POST'])
def set_current_dataset():
    """Set the current active dataset"""
    try:
        data = request.get_json()
        dataset_name = data.get('dataset')
        
        if not dataset_name:
            return jsonify({'error': 'No dataset name provided'}), 400
        
        result = load_binary_data(dataset_name)
        
        if result is None:
            return jsonify({'error': 'Failed to load dataset'}), 500
        
        return jsonify({
            'success': True,
            'dataset': dataset_name,
            'totalChannels': data_array.shape[0],
            'totalDataPoints': int(data_array.shape[1])
        })
        
    except Exception as e:
        print(f"Error setting dataset: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataset/upload', methods=['POST'])
def upload_dataset():
    """Upload a new dataset file with streaming support for large files"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': f'File type not allowed. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
        
        filename = secure_filename(file.filename)
        filepath = os.path.join(DATASETS_FOLDER, filename)
        
        chunk_size = 4096 * 1024
        with open(filepath, 'wb') as f:
            while True:
                chunk = file.stream.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
        
        file_size = os.path.getsize(filepath)
        
        print(f"Uploaded dataset: {filename} ({format_file_size(file_size)})")
        
        spike_times_filename = None
        if 'spike_times_file' in request.files:
            spike_times_file = request.files['spike_times_file']
            if spike_times_file.filename != '' and spike_times_file.filename.endswith('.pt'):
                spike_times_filename = secure_filename(spike_times_file.filename)
                spike_times_filepath = os.path.join(LABELS_FOLDER, spike_times_filename)
                
                chunk_size = 4096 * 1024
                with open(spike_times_filepath, 'wb') as f:
                    while True:
                        chunk = spike_times_file.stream.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                
                print(f"Uploaded spike times to labels folder: {spike_times_filename}")
                
                add_label_mapping(filename, spike_times_filename)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'size': file_size,
            'sizeFormatted': format_file_size(file_size),
            'spikeTimesFile': spike_times_filename
        })
        
    except Exception as e:
        print(f"Error uploading dataset: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataset/delete', methods=['DELETE'])
def delete_dataset():
    """Delete a dataset file from the datasets folder"""
    try:
        data = request.get_json()
        dataset_name = data.get('dataset')
        
        if not dataset_name:
            return jsonify({'error': 'No dataset name provided'}), 400
        
        filename = secure_filename(dataset_name)
        filepath = os.path.join(DATASETS_FOLDER, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Dataset not found'}), 404
        
        global current_dataset, data_array
        
        if dataset_name == current_dataset:
            other_datasets = []
            if os.path.exists(DATASETS_FOLDER):
                for f in os.listdir(DATASETS_FOLDER):
                    if allowed_file(f) and f != filename:
                        other_datasets.append(f)
            
            for f in ['subset_5pct.bin']:
                if os.path.exists(f) and f != filename and f not in other_datasets:
                    other_datasets.append(f)
            
            if other_datasets:
                new_dataset = other_datasets[0]
                print(f"Switching from {dataset_name} to {new_dataset} before deletion")
                load_binary_data(new_dataset)
            else:
                data_array = None
                current_dataset = None
        
        os.remove(filepath)
        
        label_filename = get_label_filename(dataset_name)
        if label_filename:
            label_path = os.path.join(LABELS_FOLDER, label_filename)
            if os.path.exists(label_path):
                try:
                    os.remove(label_path)
                    print(f"Deleted associated label file: {label_filename}")
                except Exception as e:
                    print(f"Error deleting label file: {e}")
            
            remove_label_mapping(dataset_name)
        
        print(f"Deleted dataset: {filename}")
        
        return jsonify({
            'success': True,
            'message': f'Dataset {filename} deleted successfully',
            'newCurrentDataset': current_dataset
        })
        
    except Exception as e:
        print(f"Error deleting dataset: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/label-mappings', methods=['GET'])
def get_label_mappings():
    """Get all dataset-to-label mappings"""
    try:
        return jsonify({
            'mappings': dataset_label_mapping,
            'count': len(dataset_label_mapping)
        })
    except Exception as e:
        print(f"Error getting mappings: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/label-mappings', methods=['POST'])
def add_mapping():
    """Add or update a dataset-to-label mapping"""
    try:
        data = request.get_json()
        dataset_name = data.get('dataset')
        label_name = data.get('label')
        
        if not dataset_name or not label_name:
            return jsonify({'error': 'Both dataset and label names are required'}), 400
        
        add_label_mapping(dataset_name, label_name)
        
        if dataset_name == current_dataset:
            load_spike_times(dataset_name)
        
        return jsonify({
            'success': True,
            'message': f'Mapping added: {dataset_name} -> {label_name}'
        })
    except Exception as e:
        print(f"Error adding mapping: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/label-mappings/<dataset_name>', methods=['DELETE'])
def delete_mapping(dataset_name):
    """Remove a dataset-to-label mapping"""
    try:
        if dataset_name not in dataset_label_mapping:
            return jsonify({'error': 'Mapping not found'}), 404
        
        remove_label_mapping(dataset_name)
        
        return jsonify({
            'success': True,
            'message': f'Mapping removed for: {dataset_name}'
        })
    except Exception as e:
        print(f"Error removing mapping: {e}")
        return jsonify({'error': str(e)}), 500

def format_file_size(size_bytes):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"

def generate_cluster_color(cluster_idx, total_clusters):
    """Generate a color for a cluster using HSV color space for good distribution"""
    import colorsys
    
    # Use golden ratio for better color distribution
    golden_ratio = 0.618033988749895
    hue = (cluster_idx * golden_ratio) % 1.0
    
    # Use high saturation and value for vibrant colors
    saturation = 0.7 + (cluster_idx % 3) * 0.1  # Vary saturation slightly
    value = 0.85 + (cluster_idx % 2) * 0.1  # Vary brightness slightly
    
    r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
    
    # Convert to hex
    return f'#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}'

@app.route('/api/cluster-data', methods=['POST'])
def get_cluster_data():
    """Get cluster data for visualization - supports both synthetic and real data"""
    global spike_times_data

    try:
        data = request.get_json()
        mode = data.get('mode', 'synthetic')  # 'synthetic' or 'real'
        channel_mapping = data.get('channelMapping', {})  # Dict of clusterId -> channelId

        if mode == 'real':
            # Load real cluster data from numpy file in labels folder
            cluster_file = os.path.join(LABELS_FOLDER, 'spikes_xyclu_time.npy')

            if not os.path.exists(cluster_file):
                # Try alternate name
                cluster_file = os.path.join(LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
                if not os.path.exists(cluster_file):
                    return jsonify({'error': f'Cluster data file not found in labels folder'}), 404

            print(f"Loading real cluster data from: {cluster_file}")
            spikes_arr = np.load(cluster_file)

            # Extract data
            xy_coordinates = spikes_arr[:, :2]
            cluster_ids = spikes_arr[:, 2].astype(np.int64)
            times_secs = spikes_arr[:, 3]
            sampling_frequency = 30000
            times_indices = (times_secs * sampling_frequency).astype(np.int64)

            # Get unique cluster IDs
            unique_cluster_ids = np.unique(cluster_ids)
            print(f"Found {len(unique_cluster_ids)} unique clusters with {len(cluster_ids)} total points")

            clusters = []

            for cluster_idx, cluster_id in enumerate(unique_cluster_ids):
                # Get all points for this cluster
                mask = cluster_ids == cluster_id
                cluster_points = xy_coordinates[mask]
                cluster_times = times_indices[mask]

                # Generate color for this cluster
                color = generate_cluster_color(cluster_idx, len(unique_cluster_ids))

                # Get channel ID from mapping if provided, default to 181
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

            return jsonify({
                'mode': 'real',
                'clusters': clusters,
                'numClusters': len(clusters),
                'totalPoints': len(cluster_ids),
                'clusterIds': unique_cluster_ids.tolist()
            })
            
        else:
            # Generate synthetic data (original logic)
            channel_ids = data.get('channelIds', [179, 181, 183])
            
            np.random.seed(42)
            clusters = []
            colors = ['#FF6B6B', '#4ECDC4', '#FFD700']
            centers = [[2.0, 5.0], [8.0, 2.5], [4.0, 2.0]]
            spreads = [0.8, 0.9, 0.7]
            
            for cluster_idx in range(3):
                cluster_x = np.random.normal(centers[cluster_idx][0], spreads[cluster_idx], 100)
                cluster_y = np.random.normal(centers[cluster_idx][1], spreads[cluster_idx], 100)
                
                # Get spike times for this cluster's channel
                spike_times = []
                if spike_times_data is not None and cluster_idx < len(channel_ids):
                    channel_id = channel_ids[cluster_idx]
                    
                    if isinstance(spike_times_data, np.ndarray):
                        spike_times_list = spike_times_data.tolist() if hasattr(spike_times_data, 'tolist') else list(spike_times_data)
                    elif isinstance(spike_times_data, dict):
                        channel_spikes = spike_times_data.get(channel_id) or spike_times_data.get(str(channel_id))
                        if channel_spikes is not None:
                            spike_times_list = channel_spikes.tolist() if hasattr(channel_spikes, 'tolist') else list(channel_spikes)
                        else:
                            spike_times_list = []
                    else:
                        spike_times_list = []
                    
                    spike_times = spike_times_list[:100] if len(spike_times_list) >= 100 else spike_times_list
                
                while len(spike_times) < 100:
                    spike_times.append(None)
                
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
            
            return jsonify({
                'mode': 'synthetic',
                'clusters': clusters,
                'numClusters': 3,
                'pointsPerCluster': 100,
                'channelIds': channel_ids,
                'totalPoints': 300
            })
        
    except Exception as e:
        print(f"Error getting cluster data: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/spike-preview', methods=['POST'])
def get_spike_preview():
    """Get waveform preview for a specific spike using provided spike time"""
    global data_array
    
    try:
        data = request.get_json()
        spike_time = data.get('spikeTime')
        channel_id = data.get('channelId', 1)
        window = data.get('window', 10)
        filter_type = data.get('filterType', 'highpass')
        point_index = data.get('pointIndex', 0)  # For reference only
        algorithm = data.get('algorithm', 'unknown')  # Track which algorithm
        mode = data.get('mode', 'unknown')  # Track which mode
        
        print(f"[{algorithm}/{mode}] Spike preview request - Time: {spike_time}, Channel: {channel_id}")
        
        if spike_time is None:
            return jsonify({'error': 'No spike time provided'}), 400
        
        if data_array is None:
            return jsonify({'error': 'No data loaded'}), 400
        
        spike_time = int(spike_time)
        array_index = channel_id - 1
        
        if array_index >= data_array.shape[0] or array_index < 0:
            return jsonify({'error': 'Invalid channel'}), 400
        
        # Get full channel data for filtering
        channel_data = data_array[array_index, :]
        
        # Apply selected filter to the entire channel (for proper filter behavior)
        if filter_type != 'none':
            try:
                filtered_channel = apply_filter(channel_data.astype(float), filter_type=filter_type)
            except:
                print(f"Warning: Filter failed, using raw data")
                filtered_channel = channel_data
        else:
            filtered_channel = channel_data
        
        # Extract waveform with window around spike time
        start_idx = max(0, spike_time - window)
        end_idx = min(len(filtered_channel), spike_time + window + 1)
        
        waveform = filtered_channel[start_idx:end_idx]
        
        # Round to integer for display
        waveform = np.round(waveform).astype(int)
        
        print(f"Spike preview: CH{channel_id}, time={spike_time}, window={window}, filter={filter_type}")
        
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

@app.route('/api/cluster-statistics', methods=['POST'])
def get_cluster_statistics():
    """Get statistics for specified clusters (ISI violation, spike count, peak channel, probe position)"""
    global spike_times_data, clustering_results

    try:
        data = request.get_json()
        cluster_ids = data.get('clusterIds', [])
        algorithm = data.get('algorithm', 'preprocessed_kilosort')
        
        print(f"[{algorithm}] Cluster statistics request for clusters: {cluster_ids}")

        if not cluster_ids:
            return jsonify({'statistics': {}})

        statistics = {}
        
        # Use TorchBCI JimsAlgorithm results if available
        if algorithm == 'torchbci_jims' and clustering_results is not None:
            print(f"Using TorchBCI JimsAlgorithm clustering results for statistics")
            
            for cluster_id in cluster_ids:
                if cluster_id >= len(clustering_results):
                    continue
                    
                cluster_spikes = clustering_results[cluster_id]
                
                # Extract spike times
                spike_times_samples = [spike['time'] for spike in cluster_spikes]
                spike_times_secs = np.array(spike_times_samples) / 30000.0  # Convert to seconds
                
                # Calculate ISI violations (spikes within 2ms = 0.002s)
                if len(spike_times_secs) > 1:
                    sorted_times = np.sort(spike_times_secs)
                    isis = np.diff(sorted_times)
                    isi_violations = np.sum(isis < 0.002)
                    isi_violation_rate = isi_violations / len(isis) if len(isis) > 0 else 0
                else:
                    isi_violation_rate = 0
                
                # Number of spikes
                num_spikes = len(cluster_spikes)
                
                # Peak channel (most common channel in cluster)
                channels = [spike['channel'] for spike in cluster_spikes]
                peak_channel = max(set(channels), key=channels.count) if channels else 181
                
                # PCA position (mean of x, y)
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
            
            return jsonify({'statistics': statistics})
        
        # Otherwise use preprocessed Kilosort data
        cluster_file = os.path.join(LABELS_FOLDER, 'spikes_xyclu_time.npy')
        if not os.path.exists(cluster_file):
            cluster_file = os.path.join(LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
            if not os.path.exists(cluster_file):
                return jsonify({'error': 'Cluster data file not found'}), 404

        spikes_arr = np.load(cluster_file)
        xy_coordinates = spikes_arr[:, :2]
        all_cluster_ids = spikes_arr[:, 2].astype(np.int64)
        times_secs = spikes_arr[:, 3]

        for cluster_id in cluster_ids:
            mask = all_cluster_ids == cluster_id
            cluster_times = times_secs[mask]
            cluster_xy = xy_coordinates[mask]

            # Calculate ISI violations (spikes within 2ms = 0.002s)
            if len(cluster_times) > 1:
                sorted_times = np.sort(cluster_times)
                isis = np.diff(sorted_times)
                isi_violations = np.sum(isis < 0.002)
                isi_violation_rate = isi_violations / len(isis) if len(isis) > 0 else 0
            else:
                isi_violation_rate = 0

            # Number of spikes
            num_spikes = len(cluster_times)

            # Peak channel (inferred from probe position - simplified)
            mean_x = float(np.mean(cluster_xy[:, 0])) if len(cluster_xy) > 0 else 0
            mean_y = float(np.mean(cluster_xy[:, 1])) if len(cluster_xy) > 0 else 0

            # Estimate peak channel from position (simplified mapping)
            peak_channel = int(182 + (mean_x / 10) * 20)  # Simple heuristic

            statistics[cluster_id] = {
                'isiViolationRate': float(isi_violation_rate),
                'numSpikes': int(num_spikes),
                'peakChannel': peak_channel,
                'probePosition': {
                    'x': int(round(mean_x)),
                    'y': int(round(mean_y))
                }
            }

        return jsonify({'statistics': statistics})

    except Exception as e:
        print(f"Error getting cluster statistics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/cluster-waveforms', methods=['POST'])
def get_cluster_waveforms():
    """Get waveforms for specified clusters"""
    global data_array, clustering_results

    try:
        data = request.get_json()
        cluster_ids = data.get('clusterIds', [])
        max_waveforms = data.get('maxWaveforms', 100)  # Limit number of waveforms per cluster
        window_size = data.get('windowSize', 30)  # samples before/after spike
        algorithm = data.get('algorithm', 'preprocessed_kilosort')
        
        print(f"[{algorithm}] Cluster waveforms request for clusters: {cluster_ids}")

        if not cluster_ids or data_array is None:
            return jsonify({'waveforms': {}})

        waveforms_data = {}
        
        # Use TorchBCI JimsAlgorithm results if available
        if algorithm == 'torchbci_jims' and clustering_results is not None:
            print(f"Using TorchBCI JimsAlgorithm clustering results for waveforms")
            
            for cluster_id in cluster_ids:
                if cluster_id >= len(clustering_results):
                    continue
                    
                cluster_spikes = clustering_results[cluster_id]
                
                # Limit number of waveforms
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
                    end_idx = min(data_array.shape[1], int(spike_time) + window_size)
                    
                    if start_idx < end_idx and 0 <= channel_idx < data_array.shape[0]:
                        waveform = data_array[channel_idx, start_idx:end_idx].astype(float)
                        
                        # Z-score normalize
                        if len(waveform) > 0:
                            mean = np.mean(waveform)
                            std = np.std(waveform)
                            if std > 0:
                                waveform = (waveform - mean) / std
                        
                        # Create time points in milliseconds
                        time_points = [(i - window_size) / 30.0 for i in range(len(waveform))]
                        
                        waveforms.append({
                            'timePoints': time_points,
                            'amplitude': waveform.tolist()
                        })
                
                waveforms_data[cluster_id] = waveforms
            
            return jsonify({'waveforms': waveforms_data})
        
        # Otherwise use preprocessed Kilosort data
        cluster_file = os.path.join(LABELS_FOLDER, 'spikes_xyclu_time.npy')
        if not os.path.exists(cluster_file):
            cluster_file = os.path.join(LABELS_FOLDER, 'spikes_xyclu_time 1.npy')
            if not os.path.exists(cluster_file):
                return jsonify({'error': 'Cluster data file not found'}), 404

        spikes_arr = np.load(cluster_file)
        all_cluster_ids = spikes_arr[:, 2].astype(np.int64)
        times_secs = spikes_arr[:, 3]
        sampling_frequency = 30000
        times_indices = (times_secs * sampling_frequency).astype(np.int64)

        for cluster_id in cluster_ids:
            mask = all_cluster_ids == cluster_id
            cluster_times = times_indices[mask]

            # Limit number of waveforms
            if len(cluster_times) > max_waveforms:
                indices = np.random.choice(len(cluster_times), max_waveforms, replace=False)
                cluster_times = cluster_times[indices]

            # Get peak channel (simplified - use channel 181 for now)
            peak_channel = 181
            channel_idx = peak_channel - 1

            waveforms = []
            for spike_time in cluster_times:
                start_idx = max(0, int(spike_time) - window_size)
                end_idx = min(data_array.shape[1], int(spike_time) + window_size)

                if start_idx < end_idx:
                    waveform = data_array[channel_idx, start_idx:end_idx].astype(float)

                    # Z-score normalize
                    if len(waveform) > 0:
                        mean = np.mean(waveform)
                        std = np.std(waveform)
                        if std > 0:
                            waveform = (waveform - mean) / std

                    # Create time points in milliseconds
                    time_points = [(i - window_size) / 30.0 for i in range(len(waveform))]  # Convert to ms

                    waveforms.append({
                        'timePoints': time_points,
                        'amplitude': waveform.tolist()
                    })

            waveforms_data[cluster_id] = waveforms

        return jsonify({'waveforms': waveforms_data})

    except Exception as e:
        print(f"Error getting cluster waveforms: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/spike-sorting/algorithms', methods=['GET'])
def list_spike_sorting_algorithms():
    """List all available spike sorting algorithms"""
    algorithms = []
    
    # Preprocessed Kilosort - always available (uses existing cluster data)
    algorithms.append({
        'name': 'preprocessed_kilosort',
        'displayName': 'Preprocessed Kilosort',
        'description': 'Pre-computed cluster data from Kilosort',
        'available': True,
        'requiresRun': False  # Data is already available
    })
    
    # TorchBCI JimsAlgorithm - requires running
    if JIMS_AVAILABLE:
        algorithms.append({
            'name': 'torchbci_jims',
            'displayName': 'TorchBCI JimsAlgorithm',
            'description': 'Jim\'s spike sorting algorithm with clustering',
            'available': True,
            'requiresRun': True  # Must click Run to generate data
        })
    else:
        algorithms.append({
            'name': 'torchbci_jims',
            'displayName': 'TorchBCI JimsAlgorithm',
            'description': 'Jim\'s spike sorting algorithm (not installed)',
            'available': False,
            'requiresRun': True
        })
    
    return jsonify({'algorithms': algorithms})

@app.route('/api/spike-sorting/run', methods=['POST'])
def run_spike_sorting():
    """Run JimsAlgorithm spike sorting on the entire loaded dataset"""
    global data_array
    
    if not JIMS_AVAILABLE:
        return jsonify({'error': 'TorchBCI not available. Please install torchbci package.'}), 400
    
    if data_array is None:
        return jsonify({'error': 'No dataset loaded'}), 400
    
    try:
        print(f"\n{'='*60}")
        print(f"Running JimsAlgorithm...")
        print(f"{'='*60}")
        print(f"Data Shape: {data_array.shape}")
        print(f"Data dtype: {data_array.dtype}")
        print(f"Channels: {data_array.shape[0]}")
        print(f"Time Points: {data_array.shape[1]}")
        
        # Convert data_array to torch tensor efficiently
        # torch.from_numpy() shares memory with numpy array (no copy!)
        # Only converts dtype if needed
        if data_array.dtype == np.float32:
            print("Data is already float32, creating torch tensor (zero-copy)...")
            data_tensor = torch.from_numpy(np.asarray(data_array))
        elif data_array.dtype == np.float64:
            print("Converting float64 to float32...")
            data_tensor = torch.from_numpy(np.asarray(data_array)).float()
        else:
            print(f"Converting {data_array.dtype} to float32...")
            # For int16 or other types, we need to convert
            data_tensor = torch.from_numpy(np.asarray(data_array)).float()
        
        print(f"Tensor dtype: {data_tensor.dtype}")
        print(f"Tensor is contiguous: {data_tensor.is_contiguous()}")
        
        # Create JimsAlgorithm instance with default parameters
        jims_sort_pipe = JimsAlgorithm(
            window_size=3,
            threshold=36,
            frame_size=13,
            normalize="zscore",
            sort_by="value",
            leniency_channel=7,
            leniency_time=32,
            similarity_mode="cosine",
            outlier_threshold=0.8,
            n_clusters=8,
            cluster_feature_size=7,
            n_jims_features=7,
            jims_pad_value=0
        )
        
        # Run the algorithm: clusters, centroids, clusters_meta = jims_sort_pipe.forward(data_tensor)
        print("Running jims_sort_pipe.forward(data_tensor)...")
        clusters, centroids, clusters_meta = jims_sort_pipe.forward(data_tensor)
        
        # Process results
        n_clustered_spikes = sum([len(meta) for meta in clusters_meta])
        
        print(f"\n{'='*60}")
        print(f"JimsAlgorithm Results:")
        print(f"{'='*60}")
        print(f"Number of clusters: {len(clusters)}")
        print(f"Number of detected spikes: {n_clustered_spikes}")
        
        # Print cluster info
        for i, (cluster, centroid, meta) in enumerate(zip(clusters, centroids, clusters_meta)):
            print(f"\nCluster {i}:")
            print(f"  Spikes: {len(meta)}")
            print(f"  Centroid shape: {centroid.shape}")
            if len(meta) > 0:
                print(f"  First spike meta: {meta[0]}")  # (channel, time)
        
        print(f"{'='*60}\n")

        centroids_picked = []
        clusters_meta_picked = []
        clusters_picked = []

        n_clustered_spikes = sum([len(meta) for meta in clusters_meta])
        print(f"Number of detected spikes: {n_clustered_spikes}")
        
        # Keep all clusters (no filtering)
        for cluster, centroid, meta in zip(clusters, centroids, clusters_meta):
            meta = sorted(meta, key=lambda x: x[1])
            centroids_picked.append(centroid)
            clusters_meta_picked.append(meta)
            clusters_picked.append(cluster)

        from sklearn.decomposition import PCA
        pca = PCA(n_components=2)
        all_clustered_spikes = []
        
        # Build concatenated spikes - keep track of cluster boundaries
        for cluster in clusters_picked:
            all_clustered_spikes.append(torch.stack(cluster).numpy())
        
        all_clustered_spikes = np.concatenate(all_clustered_spikes, axis=0)
        all_clustered_spikes_pca = pca.fit_transform(all_clustered_spikes)
        centroids_pca = pca.transform(torch.stack(centroids_picked).numpy())
        
        # Split PCA results back into per-cluster structure matching clusters_meta_picked
        all_clustered_spikes_pca_per_cluster = []
        start_idx = 0
        for meta in clusters_meta_picked:
            cluster_size = len(meta)
            cluster_pca = all_clustered_spikes_pca[start_idx:start_idx + cluster_size]
            all_clustered_spikes_pca_per_cluster.append(cluster_pca)
            start_idx += cluster_size

        print(f"Total spikes after filtering: {all_clustered_spikes.shape[0]}")
        print(f"PCA shape: {all_clustered_spikes_pca.shape}")
        print(f"Number of clusters: {len(all_clustered_spikes_pca_per_cluster)}")
        print(f"Cluster 0 - PCA points: {all_clustered_spikes_pca_per_cluster[0].shape if len(all_clustered_spikes_pca_per_cluster) > 0 else 'None'}")
        print(f"Cluster 0 - Metadata: {len(clusters_meta_picked[0]) if len(clusters_meta_picked) > 0 else 0} spikes")
        
        # Verify alignment
        assert start_idx == all_clustered_spikes_pca.shape[0], \
            "PCA points split doesn't match total!"
        
        # Combine PCA coordinates and metadata into single structure
        # Structure: List of clusters, each cluster is a list of dicts with {x, y, channel, time, spikeIndex}
        global clustering_results
        clustering_results = []
        
        for cluster_idx, (pca_coords, meta_list) in enumerate(zip(all_clustered_spikes_pca_per_cluster, clusters_meta_picked)):
            cluster_data = []
            for spike_idx, (pca_point, meta) in enumerate(zip(pca_coords, meta_list)):
                spike_data = {
                    'x': float(pca_point[0]),
                    'y': float(pca_point[1]),
                    'channel': int(meta[0]),
                    'time': int(meta[1]),
                    'spikeIndex': spike_idx  # Index within this cluster
                }
                cluster_data.append(spike_data)
            clustering_results.append(cluster_data)
        
        print(f"✓ Stored clustering results: {len(clustering_results)} clusters")
        
        # Prepare response
        response = {
            'success': True,
            'dataShape': list(data_tensor.shape),
            'numClusters': len(clusters),
            'numSpikes': n_clustered_spikes,
            'clusters': []
        }
        
        # Add cluster information
        for i, (cluster, centroid, meta) in enumerate(zip(clusters, centroids, clusters_meta)):
            cluster_info = {
                'clusterId': i,
                'numSpikes': len(meta),
                'centroidShape': list(centroid.shape),
                'spikeTimes': [int(m[1]) for m in meta] if len(meta) > 0 else [],
                'spikeChannels': [int(m[0]) for m in meta] if len(meta) > 0 else []
            }
            response['clusters'].append(cluster_info)
        
        return jsonify(response), 200
        
    except Exception as e:
        print(f"Error running JimsAlgorithm: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/clustering-results', methods=['GET'])
def get_clustering_results():
    """Get the stored clustering results from the last algorithm run"""
    global clustering_results
    
    if clustering_results is None:
        return jsonify({
            'available': False,
            'message': 'No clustering results available. Run the spike sorting algorithm first.'
        }), 200
    
    try:
        # Prepare summary information
        cluster_summaries = []
        for cluster_idx, cluster_data in enumerate(clustering_results):
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
            'numClusters': len(clustering_results),
            'totalSpikes': sum(len(cluster) for cluster in clustering_results),
            'clusters': cluster_summaries,
            'fullData': clustering_results  # All spike data with PCA coords + metadata
        }), 200
        
    except Exception as e:
        print(f"Error fetching clustering results: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("=" * 60)
    print("Starting Spike Visualizer API...")
    print("=" * 60)

    print("\n1. Loading mapping database...")
    load_mapping_database()
    
    print("\n2. Migrating existing labels...")
    migrate_existing_labels()
    
    print("\n3. Checking TorchBCI availability...")
    if JIMS_AVAILABLE:
        print("   ✓ TorchBCI JimsAlgorithm available")
    else:
        print("   ✗ TorchBCI not installed")
    
    print(f"\n4. Loading default dataset: {current_dataset}")
    load_binary_data()
    
    print(f"\n{'='*60}")
    print("STARTUP STATUS:")
    print(f"{'='*60}")
    print(f"  Data loaded: {data_array is not None}")
    if data_array is not None:
        print(f"  Data shape: {data_array.shape}")
    print(f"  Total channels: {nrows}")
    print(f"  Current dataset: {current_dataset}")
    print(f"  Spike times loaded: {spike_times_data is not None}")
    if spike_times_data is not None:
        print(f"  Spike times type: {type(spike_times_data)}")
        if isinstance(spike_times_data, (np.ndarray, list)):
            print(f"  Spike count: {len(spike_times_data)}")
        elif isinstance(spike_times_data, dict):
            print(f"  Spike channels: {len(spike_times_data)}")
    print(f"  Dataset-Label mappings: {len(dataset_label_mapping)}")
    if dataset_label_mapping:
        print(f"\nLabel Mappings:")
        for dataset, label in dataset_label_mapping.items():
            label_path = os.path.join(LABELS_FOLDER, label)
            exists = "✓" if os.path.exists(label_path) else "✗"
            print(f"    {exists} {dataset} -> {label}")
    print("=" * 60)
    print("\nAPI Server starting on http://localhost:5000")
    print("=" * 60)
    
    app.run(debug=True, host='0.0.0.0', port=5000)
