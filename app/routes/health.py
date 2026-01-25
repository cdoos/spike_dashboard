"""
Health check routes.

Provides health and status endpoints for monitoring.
"""

from flask import Blueprint, jsonify

from app.logger import get_logger

logger = get_logger(__name__)

health_bp = Blueprint('health', __name__)


@health_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring."""
    return jsonify({
        'status': 'healthy',
        'service': 'spike-dashboard-api'
    }), 200


@health_bp.route('/api/dataset-info', methods=['GET'])
def get_dataset_info():
    """Get dataset information."""
    from flask import current_app
    
    try:
        dataset_manager = current_app.config['dataset_manager']
        
        if dataset_manager.data_array is None:
            return jsonify({'error': 'Data not loaded'}), 500
        
        return jsonify({
            'totalChannels': dataset_manager.data_array.shape[0],
            'totalDataPoints': int(dataset_manager.data_array.shape[1]),
            'maxTimeRange': int(dataset_manager.data_array.shape[1])
        })
    except Exception as e:
        logger.error(f"Error in get_dataset_info: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
