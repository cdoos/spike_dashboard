"""
Spike times management service.

Handles loading and querying of spike timing data.
"""

import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch

from app.config import Config
from app.services.label_mapping_manager import LabelMappingManager
from app.logger import get_logger

logger = get_logger(__name__)


class SpikeTimesManager:
    """Manages spike times data."""
    
    def __init__(self, config: Config, mapping_manager: LabelMappingManager):
        self.config = config
        self.mapping_manager = mapping_manager
        self.spike_times_data: Optional[Any] = None
    
    def load_spike_times(self, dataset_filename: str) -> bool:
        """Load spike times file associated with a dataset."""
        logger.info(f"Loading spike times for: {dataset_filename}")
        self.spike_times_data = None
        
        label_filename = self.mapping_manager.get_mapping(dataset_filename)
        logger.debug(f"Label filename from mapping: {label_filename}")
        
        if not label_filename:
            logger.warning(f"No label mapping found for dataset: {dataset_filename}")
            return False
        
        spike_path = os.path.join(self.config.LABELS_FOLDER, label_filename)
        logger.debug(f"Looking for spike times at: {spike_path}")
        
        if not os.path.exists(spike_path):
            logger.warning(f"Label file not found: {spike_path}")
            return False
        
        try:
            logger.info(f"Loading spike times from: {spike_path}")
            loaded_data = torch.load(spike_path, weights_only=False)
            
            if isinstance(loaded_data, np.ndarray):
                self.spike_times_data = loaded_data
                logger.info(f"Using spike times as numpy array: {len(self.spike_times_data)} spikes")
            elif torch.is_tensor(loaded_data):
                self.spike_times_data = loaded_data.numpy()
                logger.info(f"Converted torch tensor to numpy array: {len(self.spike_times_data)} spikes")
            elif isinstance(loaded_data, dict):
                self.spike_times_data = {}
                for key in loaded_data:
                    if torch.is_tensor(loaded_data[key]):
                        self.spike_times_data[key] = loaded_data[key].numpy()
                    else:
                        self.spike_times_data[key] = loaded_data[key]
                logger.info(f"Using channel-specific spike times: {len(self.spike_times_data)} channels")
            
            logger.info("Spike times loaded successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error loading spike times from {spike_path}: {e}", exc_info=True)
            self.spike_times_data = None
            return False
    
    def get_spike_times_info(self) -> Dict[str, Any]:
        """Get information about loaded spike times."""
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
        """Find next or previous spike time."""
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
                target_spike = unique_spikes[0]  # Wrap around
        else:  # 'prev'
            for spike_time in reversed(unique_spikes):
                if spike_time < current_time:
                    target_spike = spike_time
                    break
            if target_spike is None and unique_spikes:
                target_spike = unique_spikes[-1]  # Wrap around
        
        if target_spike is None:
            return None
        
        return (int(target_spike), len(unique_spikes))
