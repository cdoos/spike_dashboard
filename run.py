#!/usr/bin/env python3
"""
Spike Dashboard API - Entry Point

This is the main entry point for running the Spike Dashboard API server.
It uses the modular application structure from the app package.

Usage:
    python run.py

Environment Variables:
    FLASK_DEBUG     - Enable debug mode (default: false)
    HOST            - Host to bind to (default: 0.0.0.0)
    PORT            - Port to run on (default: 5000)
    CORS_ORIGINS    - Allowed CORS origins (default: *)
    DATASETS_FOLDER - Path to datasets folder (default: datasets)
    LOG_LEVEL       - Logging level (default: INFO)
"""

from dotenv import load_dotenv
load_dotenv()

from app import create_app, run_app
from app.config import get_config


if __name__ == '__main__':
    config = get_config()
    app = create_app(config)
    run_app(app, config)
