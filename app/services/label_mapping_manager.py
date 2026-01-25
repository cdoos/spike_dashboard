"""
Label mapping management service.

Handles mapping between datasets and their label files.
"""

import json
import os
import shutil
from typing import Dict, Optional

from app.config import Config
from app.logger import get_logger

logger = get_logger(__name__)


class LabelMappingManager:
    """Manages dataset to label file mappings."""
    
    def __init__(self, config: Config):
        self.config = config
        self.mappings: Dict[str, str] = {}
        self.load_mappings()
    
    def load_mappings(self) -> None:
        """Load the dataset-to-label mapping database."""
        if os.path.exists(self.config.MAPPING_DB_PATH):
            try:
                with open(self.config.MAPPING_DB_PATH, 'r') as f:
                    self.mappings = json.load(f)
                logger.info(f"Loaded mapping database: {len(self.mappings)} entries")
            except Exception as e:
                logger.error(f"Error loading mapping database: {e}")
                self.mappings = {}
        else:
            self.mappings = {}
            self.save_mappings()
    
    def save_mappings(self) -> None:
        """Save the dataset-to-label mapping database."""
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.config.MAPPING_DB_PATH), exist_ok=True)
            with open(self.config.MAPPING_DB_PATH, 'w') as f:
                json.dump(self.mappings, f, indent=2)
            logger.info(f"Saved mapping database: {len(self.mappings)} entries")
        except Exception as e:
            logger.error(f"Error saving mapping database: {e}")
    
    def add_mapping(self, dataset_name: str, label_filename: str) -> None:
        """Add or update a dataset-to-label mapping."""
        self.mappings[dataset_name] = label_filename
        self.save_mappings()
        logger.info(f"Added mapping: {dataset_name} -> {label_filename}")
    
    def get_mapping(self, dataset_name: str) -> Optional[str]:
        """Get the label filename for a given dataset."""
        return self.mappings.get(dataset_name)
    
    def remove_mapping(self, dataset_name: str) -> None:
        """Remove a dataset-to-label mapping."""
        if dataset_name in self.mappings:
            del self.mappings[dataset_name]
            self.save_mappings()
            logger.info(f"Removed mapping for: {dataset_name}")
    
    def get_all_mappings(self) -> Dict[str, str]:
        """Get all mappings."""
        return self.mappings.copy()
    
    def migrate_existing_labels(self) -> None:
        """Move spike time files from datasets to labels folder and auto-detect mappings."""
        if not os.path.exists(self.config.DATASETS_FOLDER):
            return
        
        # Ensure labels folder exists
        os.makedirs(self.config.LABELS_FOLDER, exist_ok=True)
        
        label_patterns = ['_spike_times.pt', '_spikes.pt', '_times.pt', '_labels']
        
        for filename in os.listdir(self.config.DATASETS_FOLDER):
            if any(pattern in filename for pattern in label_patterns) and filename.endswith('.pt'):
                old_path = os.path.join(self.config.DATASETS_FOLDER, filename)
                new_path = os.path.join(self.config.LABELS_FOLDER, filename)
                
                if os.path.isfile(old_path) and not os.path.exists(new_path):
                    try:
                        shutil.move(old_path, new_path)
                        logger.info(f"Migrated label file: {filename} -> datasets/labels/")
                        
                        # Try to auto-detect the corresponding dataset
                        base_name = filename.replace('_labels', '_data')
                        base_name = base_name.replace('_spike_times', '')
                        base_name = base_name.replace('_spikes', '')
                        base_name = base_name.replace('_times', '')
                        
                        if not base_name.endswith('.pt'):
                            base_name = base_name + '.pt'
                        
                        dataset_path = os.path.join(self.config.DATASETS_FOLDER, base_name)
                        if os.path.exists(dataset_path):
                            self.add_mapping(base_name, filename)
                            logger.info(f"Auto-detected mapping: {base_name} -> {filename}")
                    except Exception as e:
                        logger.error(f"Error migrating {filename}: {e}")
