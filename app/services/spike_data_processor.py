"""
Spike data processing service.

Handles processing and extraction of spike data for visualization.
"""

from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.services.dataset_manager import DatasetManager
from app.services.spike_times_manager import SpikeTimesManager
from app.services.filter_processor import FilterProcessor
from app.logger import get_logger

logger = get_logger(__name__)


class SpikeDataProcessor:
    """Processes spike data for visualization."""
    
    def __init__(self, dataset_manager: DatasetManager, spike_times_manager: SpikeTimesManager):
        self.dataset_manager = dataset_manager
        self.spike_times_manager = spike_times_manager
    
    def get_real_data(
        self, 
        channels: List[int], 
        spike_threshold: Optional[int], 
        invert_data: bool, 
        start_time: int, 
        end_time: int, 
        data_type: str, 
        filter_type: str
    ) -> Dict[int, Any]:
        """Get real spike data for requested channels."""
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
                filtered_data = FilterProcessor.apply_filter_with_buffer(
                    channel_data,
                    self.dataset_manager.data_array,
                    channel_id - 1,
                    start_time,
                    end_time,
                    filter_type
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
            
            logger.debug(
                f"Channel {channel_id}: Sending {len(channel_data)} points "
                f"(range: {start_time}-{end_time}, type: {data_type}, "
                f"filter: {filter_type}, peaks: {len(spike_peaks)})"
            )
            
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
    
    def get_precomputed_spike_data(
        self, 
        channels: List[int], 
        start_time: int, 
        end_time: int, 
        filter_type: str, 
        invert_data: bool, 
        data_type: str
    ) -> Dict[int, Any]:
        """Get spike data using precomputed spike times."""
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
                filtered_data_array = FilterProcessor.apply_filter_with_buffer(
                    channel_data,
                    self.dataset_manager.data_array,
                    channel_id - 1,
                    start_time,
                    end_time,
                    filter_type
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
            
            logger.debug(
                f"Channel {channel_id}: {len(spike_peaks)} spikes "
                f"(window: ±{spike_window}), filter={filter_type}, global={is_global}"
            )
            
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
    
    def _detect_spikes(
        self, 
        channel_data: np.ndarray, 
        spike_threshold: Optional[int],
        invert_data: bool
    ) -> Tuple[Any, List[int]]:
        """Detect spikes in channel data."""
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
