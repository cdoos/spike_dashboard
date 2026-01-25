"""
Dataset management service.

Handles loading and accessing neural data from various file formats.
"""

import os
from typing import Optional

import numpy as np
import torch

from app.config import Config
from app.logger import get_logger

logger = get_logger(__name__)


class DatasetManager:
    """Manages dataset loading and access."""
    
    def __init__(self, config: Config):
        self.config = config
        self.data_array: Optional[np.ndarray] = None
        self.current_dataset: Optional[str] = config.DEFAULT_DATASET
        self.nrows: int = config.DEFAULT_CHANNELS
        
    def load_data(self, filename: Optional[str] = None) -> Optional[np.ndarray]:
        """Load binary data from file."""
        if filename is None:
            filename = self.current_dataset
        
        dataset_path = os.path.join(self.config.DATASETS_FOLDER, filename)
        if not os.path.exists(dataset_path):
            dataset_path = filename
            if not os.path.exists(dataset_path):
                logger.warning(f"{filename} not found. Using mock data.")
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
            logger.error(f"Error loading data: {e}", exc_info=True)
            return None
    
    def _load_pt_file(self, dataset_path: str, filename: str) -> Optional[np.ndarray]:
        """Load PyTorch file with optimized memory mapping."""
        float32_path = dataset_path.replace('.pt', '_float32.npy')
        
        if os.path.exists(float32_path):
            logger.info(f"Found preprocessed float32 file: {float32_path}")
            logger.info("Loading as memmap (efficient, no disk thrashing)...")
            data = np.load(float32_path, allow_pickle=True, mmap_mode='r')
            logger.info(f"Loaded float32 memmap: {data.shape}, dtype: {data.dtype}")
            return data
        
        npy_path = dataset_path.replace('.pt', '_mmap.npy')
        shape_path = dataset_path.replace('.pt', '_shape.txt')
        
        if os.path.exists(npy_path) and os.path.exists(shape_path):
            logger.info(f"Loading memory-mapped array from {npy_path}")
            with open(shape_path, 'r') as f:
                shape = tuple(map(int, f.read().strip().split(',')))
            data = np.memmap(npy_path, dtype=np.int16, mode='r', shape=shape)
            logger.info(f"Memory-mapped data loaded: {data.shape}")
            logger.info("TIP: Convert to float32 for better JimsAlgorithm performance: python convert_to_float32.py")
            return data
        
        file_size_gb = os.path.getsize(dataset_path) / (1024**3)
        logger.info(f"Loading PyTorch tensor from {dataset_path}")
        logger.warning(f"Loading full {file_size_gb:.2f} GB into RAM")
        
        tensor_data = torch.load(dataset_path, weights_only=False)
        
        if torch.is_tensor(tensor_data):
            data = tensor_data.numpy()
        elif isinstance(tensor_data, np.ndarray):
            data = tensor_data
        else:
            logger.error(f"Unexpected data type in .pt file: {type(tensor_data)}")
            return None
        
        if data.ndim == 2 and data.shape[0] > data.shape[1]:
            logger.info(f"Transposing data from {data.shape} to ({data.shape[1]}, {data.shape[0]})")
            data = data.T
        
        logger.info(f"Loaded PyTorch data: {data.shape}")
        return data
    
    def _load_npy_file(self, dataset_path: str) -> Optional[np.ndarray]:
        """Load numpy file with memory mapping."""
        float32_path = dataset_path.replace('.npy', '_float32.npy')
        
        if '_float32.npy' in dataset_path or os.path.exists(float32_path):
            path = dataset_path if '_float32.npy' in dataset_path else float32_path
            logger.info(f"Loading float32 numpy memmap from {path}")
            data = np.load(path, allow_pickle=True, mmap_mode='r')
            logger.info(f"Loaded float32 memmap: {data.shape}, dtype: {data.dtype}")
        else:
            logger.info(f"Loading numpy memmap from {dataset_path}")
            data = np.load(dataset_path, allow_pickle=True, mmap_mode='r')
            logger.info(f"Loaded memmap: {data.shape}, dtype: {data.dtype}")
            
            if data.dtype != np.float32:
                logger.info("TIP: Convert to float32 for better performance: python convert_to_float32.py")
        
        return data
    
    def _load_binary_file(self, dataset_path: str) -> Optional[np.ndarray]:
        """Load binary file with memory mapping."""
        float32_path = dataset_path.replace('.bin', '_float32.npy')
        
        if os.path.exists(float32_path):
            logger.info(f"Found preprocessed float32 file: {float32_path}")
            data = np.load(float32_path, allow_pickle=True, mmap_mode='r')
            logger.info(f"Loaded float32 memmap: {data.shape}, dtype: {data.dtype}")
        else:
            logger.info(f"Loading int16 binary from {dataset_path}")
            logger.info("Tip: Run convert_to_float32.py to preprocess for better performance!")
            data_memmap = np.memmap(dataset_path, dtype=np.int16, mode='r')
            data = data_memmap.reshape((-1, self.nrows)).T
        
        return data
    
    def get_channel_data(self, channel_id: int, start_time: int, end_time: int) -> Optional[np.ndarray]:
        """Get data for a specific channel and time range."""
        if self.data_array is None:
            return None
        
        array_index = channel_id - 1
        if array_index >= self.data_array.shape[0] or array_index < 0:
            return None
        
        total_available = self.data_array.shape[1]
        start_time = max(0, int(start_time))
        end_time = min(total_available, int(end_time))
        
        return self.data_array[array_index, start_time:end_time]
    
    def get_info(self) -> dict:
        """Get dataset information."""
        if self.data_array is None:
            return {
                'loaded': False,
                'dataset': self.current_dataset,
                'channels': self.nrows
            }
        
        return {
            'loaded': True,
            'dataset': self.current_dataset,
            'channels': self.data_array.shape[0],
            'total_samples': int(self.data_array.shape[1]),
            'dtype': str(self.data_array.dtype)
        }
