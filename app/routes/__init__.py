"""Route blueprints for the Spike Dashboard API."""

from app.routes.health import health_bp
from app.routes.datasets import datasets_bp
from app.routes.spike_data import spike_data_bp
from app.routes.clustering import clustering_bp

__all__ = [
    'health_bp',
    'datasets_bp',
    'spike_data_bp',
    'clustering_bp'
]
