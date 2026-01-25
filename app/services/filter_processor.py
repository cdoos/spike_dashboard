"""
Signal filtering service.

Handles various signal filtering operations for neural data.
"""

import numpy as np
from scipy.signal import butter, filtfilt

from app.config import get_config
from app.logger import get_logger

logger = get_logger(__name__)


class FilterProcessor:
    """Handles signal filtering operations."""
    
    # Filter frequency constants
    HIGHPASS_CUTOFF = 300  # Hz
    LOWPASS_CUTOFF = 3000  # Hz
    BANDPASS_LOW = 300  # Hz
    BANDPASS_HIGH = 3000  # Hz
    
    @staticmethod
    def apply_filter(
        data: np.ndarray, 
        filter_type: str = 'highpass', 
        sampling_rate: int = None,
        order: int = 4
    ) -> np.ndarray:
        """
        Apply Butterworth filter to signal.
        
        Args:
            data: Input signal data
            filter_type: Type of filter ('highpass', 'lowpass', 'bandpass')
            sampling_rate: Sampling rate in Hz (defaults to config value)
            order: Filter order
            
        Returns:
            Filtered signal data
        """
        config = get_config()
        if sampling_rate is None:
            sampling_rate = config.SAMPLING_RATE
            
        try:
            nyquist = sampling_rate / 2.0
            
            if filter_type == 'highpass':
                cutoff_freq = FilterProcessor.HIGHPASS_CUTOFF
                normalized_cutoff = cutoff_freq / nyquist
                b, a = butter(order, normalized_cutoff, btype='high', analog=False)
                
            elif filter_type == 'lowpass':
                cutoff_freq = FilterProcessor.LOWPASS_CUTOFF
                normalized_cutoff = cutoff_freq / nyquist
                b, a = butter(order, normalized_cutoff, btype='low', analog=False)
                
            elif filter_type == 'bandpass':
                low_cutoff = FilterProcessor.BANDPASS_LOW
                high_cutoff = FilterProcessor.BANDPASS_HIGH
                low_normalized = low_cutoff / nyquist
                high_normalized = high_cutoff / nyquist
                b, a = butter(order, [low_normalized, high_normalized], btype='band', analog=False)
                
            else:
                logger.warning(f"Unknown filter type: {filter_type}")
                return data
            
            filtered_data = filtfilt(b, a, data)
            return filtered_data
            
        except Exception as e:
            logger.error(f"Error applying {filter_type} filter: {e}")
            return data
    
    @staticmethod
    def apply_filter_with_buffer(
        data: np.ndarray,
        full_data: np.ndarray,
        channel_idx: int,
        start_time: int,
        end_time: int,
        filter_type: str,
        buffer_size: int = 100
    ) -> np.ndarray:
        """
        Apply filter with buffer to avoid edge effects.
        
        Args:
            data: Channel data slice to filter
            full_data: Full dataset array
            channel_idx: Channel index (0-based)
            start_time: Start time index
            end_time: End time index
            filter_type: Type of filter to apply
            buffer_size: Buffer size on each side
            
        Returns:
            Filtered data slice
        """
        total_available = full_data.shape[1]
        buffer_start = max(0, start_time - buffer_size)
        buffer_end = min(total_available, end_time + buffer_size)
        
        # Get buffered data
        buffered_data = full_data[channel_idx, buffer_start:buffer_end]
        
        # Store original mean for DC restoration
        original_mean = np.mean(data)
        
        # Apply filter to buffered data
        filtered_buffered = FilterProcessor.apply_filter(
            buffered_data.astype(float), 
            filter_type=filter_type
        )
        
        # Extract the portion corresponding to original data
        offset = start_time - buffer_start
        filtered_data = filtered_buffered[offset:offset + len(data)]
        
        # Restore DC offset for highpass/bandpass filters
        if filter_type in ['highpass', 'bandpass']:
            filtered_data = filtered_data + original_mean
        
        return filtered_data
