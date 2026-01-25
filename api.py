#!/usr/bin/env python3
"""
Spike Dashboard API - Main Entry Point

This module provides backwards compatibility with the original api.py while
using the new modular application structure.

Usage:
    python api.py

For the new modular entry point, use:
    python run.py

Note: The original monolithic api.py has been preserved as api_legacy.py
"""

import os
import sys

# Ensure the app module can be found
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, run_app
from app.config import get_config
from app.logger import get_logger

logger = get_logger(__name__)


def main():
    """Main entry point for the API server."""
    logger.info("=" * 60)
    logger.info("Spike Visualizer API - Production Ready")
    logger.info("=" * 60)
    
    config = get_config()
    app = create_app(config)
    
    # Print startup info
    dataset_manager = app.config['dataset_manager']
    mapping_manager = app.config['mapping_manager']
    spike_times_manager = app.config['spike_times_manager']
    
    logger.info("STARTUP STATUS:")
    logger.info(f"  Data loaded: {dataset_manager.data_array is not None}")
    if dataset_manager.data_array is not None:
        logger.info(f"  Data shape: {dataset_manager.data_array.shape}")
    logger.info(f"  Total channels: {dataset_manager.nrows}")
    logger.info(f"  Current dataset: {dataset_manager.current_dataset}")
    logger.info(f"  Spike times loaded: {spike_times_manager.spike_times_data is not None}")
    logger.info(f"  Dataset-Label mappings: {len(mapping_manager.mappings)}")
    
    if mapping_manager.mappings:
        logger.info("Label Mappings:")
        for dataset, label in mapping_manager.mappings.items():
            label_path = os.path.join(config.LABELS_FOLDER, label)
            exists = "OK" if os.path.exists(label_path) else "MISSING"
            logger.info(f"    [{exists}] {dataset} -> {label}")
    
    logger.info("=" * 60)
    logger.info(f"API Server starting on http://{config.HOST}:{config.PORT}")
    logger.info("=" * 60)
    
    run_app(app, config)


if __name__ == '__main__':
    main()
