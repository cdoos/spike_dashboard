"""
Logging configuration module.

Provides structured logging setup for the Spike Dashboard API.
"""

import logging
import sys
from typing import Optional

from app.config import get_config


# Store configured loggers to avoid duplicate handlers
_configured_loggers = set()


def setup_logger(
    name: str,
    level: Optional[str] = None,
    format_string: Optional[str] = None
) -> logging.Logger:
    """
    Set up and return a configured logger.
    
    Args:
        name: Logger name (typically __name__ of the module)
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        format_string: Custom format string for log messages
        
    Returns:
        Configured logger instance
    """
    config = get_config()
    
    # Use config defaults if not specified
    level = level or config.LOG_LEVEL
    format_string = format_string or config.LOG_FORMAT
    
    logger = logging.getLogger(name)
    
    # Avoid adding duplicate handlers
    if name in _configured_loggers:
        return logger
    
    # Set log level
    log_level = getattr(logging, level.upper(), logging.INFO)
    logger.setLevel(log_level)
    
    # Create console handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    
    # Create formatter
    formatter = logging.Formatter(format_string)
    handler.setFormatter(formatter)
    
    # Add handler to logger
    logger.addHandler(handler)
    
    # Prevent propagation to root logger
    logger.propagate = False
    
    _configured_loggers.add(name)
    
    return logger


def get_logger(name: str) -> logging.Logger:
    """
    Get or create a logger with the given name.
    
    Args:
        name: Logger name (typically __name__ of the module)
        
    Returns:
        Logger instance
    """
    if name not in _configured_loggers:
        return setup_logger(name)
    return logging.getLogger(name)


class LoggerAdapter(logging.LoggerAdapter):
    """
    Custom logger adapter for adding context to log messages.
    
    Example:
        logger = LoggerAdapter(get_logger(__name__), {'request_id': '12345'})
        logger.info("Processing request")  # Includes request_id in output
    """
    
    def process(self, msg, kwargs):
        """Add extra context to log message."""
        extra = self.extra.copy()
        extra.update(kwargs.get('extra', {}))
        kwargs['extra'] = extra
        
        # Format context into message
        context_str = ' '.join(f'[{k}={v}]' for k, v in self.extra.items())
        if context_str:
            msg = f'{context_str} {msg}'
        
        return msg, kwargs


# Create root application logger
app_logger = setup_logger('spike_dashboard')


def log_request(endpoint: str, method: str, **kwargs):
    """Log an API request."""
    app_logger.info(f"Request: {method} {endpoint}", extra=kwargs)


def log_response(endpoint: str, status_code: int, **kwargs):
    """Log an API response."""
    level = logging.INFO if status_code < 400 else logging.WARNING
    app_logger.log(level, f"Response: {endpoint} -> {status_code}", extra=kwargs)


def log_error(message: str, exc_info: bool = True, **kwargs):
    """Log an error with optional exception info."""
    app_logger.error(message, exc_info=exc_info, extra=kwargs)


def log_warning(message: str, **kwargs):
    """Log a warning message."""
    app_logger.warning(message, extra=kwargs)


def log_info(message: str, **kwargs):
    """Log an info message."""
    app_logger.info(message, extra=kwargs)


def log_debug(message: str, **kwargs):
    """Log a debug message."""
    app_logger.debug(message, extra=kwargs)
