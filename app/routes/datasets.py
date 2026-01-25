"""
Dataset management routes.

Handles dataset listing, selection, upload, and deletion.
"""

import os
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename

from app.logger import get_logger
from app.utils.responses import success_response, error_response, validation_error, not_found_error, server_error

logger = get_logger(__name__)

datasets_bp = Blueprint('datasets', __name__)


def _allowed_file(filename: str) -> bool:
    """Check if file extension is allowed."""
    config = current_app.config['app_config']
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in config.ALLOWED_EXTENSIONS


def _format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"


@datasets_bp.route('/api/datasets', methods=['GET'])
def list_datasets():
    """List all available datasets."""
    try:
        config = current_app.config['app_config']
        datasets = []
        label_files = set()
        
        if os.path.exists(config.LABELS_FOLDER):
            for filename in os.listdir(config.LABELS_FOLDER):
                if filename.endswith('.pt'):
                    label_files.add(filename)
        
        if os.path.exists(config.DATASETS_FOLDER):
            for filename in os.listdir(config.DATASETS_FOLDER):
                if _allowed_file(filename) and filename not in label_files:
                    filepath = os.path.join(config.DATASETS_FOLDER, filename)
                    if os.path.isfile(filepath):
                        file_size = os.path.getsize(filepath)
                        datasets.append({
                            'name': filename,
                            'size': file_size,
                            'sizeFormatted': _format_file_size(file_size)
                        })
        
        dataset_manager = current_app.config['dataset_manager']
        return jsonify({
            'datasets': datasets,
            'current': dataset_manager.current_dataset
        })
    except Exception as e:
        logger.error(f"Error listing datasets: {e}", exc_info=True)
        return server_error("Failed to list datasets", exception=e)


@datasets_bp.route('/api/dataset/set', methods=['POST'])
def set_current_dataset():
    """Set the current active dataset."""
    try:
        data = request.get_json()
        dataset_name = data.get('dataset')
        
        if not dataset_name:
            return validation_error('No dataset name provided', field='dataset')
        
        dataset_manager = current_app.config['dataset_manager']
        spike_times_manager = current_app.config['spike_times_manager']
        
        result = dataset_manager.load_data(dataset_name)
        
        if result is None:
            return error_response('Failed to load dataset', status=500)
        
        spike_times_manager.load_spike_times(dataset_name)
        
        return jsonify({
            'success': True,
            'dataset': dataset_name,
            'totalChannels': dataset_manager.data_array.shape[0],
            'totalDataPoints': int(dataset_manager.data_array.shape[1])
        })
    except Exception as e:
        logger.error(f"Error setting dataset: {e}", exc_info=True)
        return server_error("Failed to set dataset", exception=e)


@datasets_bp.route('/api/dataset/upload', methods=['POST'])
def upload_dataset():
    """Upload a new dataset file."""
    try:
        if 'file' not in request.files:
            return validation_error('No file provided', field='file')
        
        file = request.files['file']
        
        if file.filename == '':
            return validation_error('No file selected', field='file')
        
        if not _allowed_file(file.filename):
            config = current_app.config['app_config']
            return validation_error(
                f'File type not allowed. Allowed types: {", ".join(config.ALLOWED_EXTENSIONS)}',
                field='file'
            )
        
        config = current_app.config['app_config']
        filename = secure_filename(file.filename)
        filepath = os.path.join(config.DATASETS_FOLDER, filename)
        
        # Stream upload in chunks
        chunk_size = 4096 * 1024
        with open(filepath, 'wb') as f:
            while True:
                chunk = file.stream.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
        
        file_size = os.path.getsize(filepath)
        logger.info(f"Uploaded dataset: {filename} ({_format_file_size(file_size)})")
        
        # Handle spike times file if provided
        spike_times_filename = None
        if 'spike_times_file' in request.files:
            spike_times_file = request.files['spike_times_file']
            if spike_times_file.filename != '' and spike_times_file.filename.endswith('.pt'):
                spike_times_filename = secure_filename(spike_times_file.filename)
                spike_times_filepath = os.path.join(config.LABELS_FOLDER, spike_times_filename)
                
                with open(spike_times_filepath, 'wb') as f:
                    while True:
                        chunk = spike_times_file.stream.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                
                logger.info(f"Uploaded spike times: {spike_times_filename}")
                mapping_manager = current_app.config['mapping_manager']
                mapping_manager.add_mapping(filename, spike_times_filename)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'size': file_size,
            'sizeFormatted': _format_file_size(file_size),
            'spikeTimesFile': spike_times_filename
        })
    except Exception as e:
        logger.error(f"Error uploading dataset: {e}", exc_info=True)
        return server_error("Failed to upload dataset", exception=e)


@datasets_bp.route('/api/dataset/delete', methods=['DELETE'])
def delete_dataset():
    """Delete a dataset file."""
    try:
        data = request.get_json()
        dataset_name = data.get('dataset')
        
        if not dataset_name:
            return validation_error('No dataset name provided', field='dataset')
        
        config = current_app.config['app_config']
        filename = secure_filename(dataset_name)
        filepath = os.path.join(config.DATASETS_FOLDER, filename)
        
        if not os.path.exists(filepath):
            return not_found_error('Dataset', dataset_name)
        
        dataset_manager = current_app.config['dataset_manager']
        spike_times_manager = current_app.config['spike_times_manager']
        mapping_manager = current_app.config['mapping_manager']
        
        # Switch to another dataset if deleting current
        if dataset_name == dataset_manager.current_dataset:
            other_datasets = []
            if os.path.exists(config.DATASETS_FOLDER):
                for f in os.listdir(config.DATASETS_FOLDER):
                    if _allowed_file(f) and f != filename:
                        other_datasets.append(f)
            
            if other_datasets:
                new_dataset = other_datasets[0]
                logger.info(f"Switching from {dataset_name} to {new_dataset} before deletion")
                dataset_manager.load_data(new_dataset)
                spike_times_manager.load_spike_times(new_dataset)
            else:
                dataset_manager.data_array = None
                dataset_manager.current_dataset = None
        
        os.remove(filepath)
        
        # Delete associated label file
        label_filename = mapping_manager.get_mapping(dataset_name)
        if label_filename:
            label_path = os.path.join(config.LABELS_FOLDER, label_filename)
            if os.path.exists(label_path):
                try:
                    os.remove(label_path)
                    logger.info(f"Deleted associated label file: {label_filename}")
                except Exception as e:
                    logger.error(f"Error deleting label file: {e}")
            
            mapping_manager.remove_mapping(dataset_name)
        
        logger.info(f"Deleted dataset: {filename}")
        
        return jsonify({
            'success': True,
            'message': f'Dataset {filename} deleted successfully',
            'newCurrentDataset': dataset_manager.current_dataset
        })
    except Exception as e:
        logger.error(f"Error deleting dataset: {e}", exc_info=True)
        return server_error("Failed to delete dataset", exception=e)


@datasets_bp.route('/api/label-mappings', methods=['GET'])
def get_label_mappings():
    """Get all dataset-to-label mappings."""
    try:
        mapping_manager = current_app.config['mapping_manager']
        return jsonify({
            'mappings': mapping_manager.mappings,
            'count': len(mapping_manager.mappings)
        })
    except Exception as e:
        logger.error(f"Error getting mappings: {e}", exc_info=True)
        return server_error("Failed to get mappings", exception=e)


@datasets_bp.route('/api/label-mappings', methods=['POST'])
def add_mapping():
    """Add or update a dataset-to-label mapping."""
    try:
        data = request.get_json()
        dataset_name = data.get('dataset')
        label_name = data.get('label')
        
        if not dataset_name or not label_name:
            return validation_error('Both dataset and label names are required')
        
        mapping_manager = current_app.config['mapping_manager']
        dataset_manager = current_app.config['dataset_manager']
        spike_times_manager = current_app.config['spike_times_manager']
        
        mapping_manager.add_mapping(dataset_name, label_name)
        
        if dataset_name == dataset_manager.current_dataset:
            spike_times_manager.load_spike_times(dataset_name)
        
        return jsonify({
            'success': True,
            'message': f'Mapping added: {dataset_name} -> {label_name}'
        })
    except Exception as e:
        logger.error(f"Error adding mapping: {e}", exc_info=True)
        return server_error("Failed to add mapping", exception=e)


@datasets_bp.route('/api/label-mappings/<dataset_name>', methods=['DELETE'])
def delete_mapping(dataset_name):
    """Remove a dataset-to-label mapping."""
    try:
        mapping_manager = current_app.config['mapping_manager']
        
        if dataset_name not in mapping_manager.mappings:
            return not_found_error('Mapping', dataset_name)
        
        mapping_manager.remove_mapping(dataset_name)
        
        return jsonify({
            'success': True,
            'message': f'Mapping removed for: {dataset_name}'
        })
    except Exception as e:
        logger.error(f"Error removing mapping: {e}", exc_info=True)
        return server_error("Failed to remove mapping", exception=e)
