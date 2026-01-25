"""
Standardized API response utilities.

Provides consistent response formats across all API endpoints.
"""

from flask import jsonify
from typing import Any, Optional, Dict, Tuple
from functools import wraps

from app.logger import log_error


# Response type alias
Response = Tuple[Any, int]


def success_response(
    data: Any = None,
    message: Optional[str] = None,
    status: int = 200
) -> Response:
    """
    Create a successful API response.
    
    Args:
        data: Response data payload
        message: Optional success message
        status: HTTP status code (default 200)
        
    Returns:
        Tuple of (response JSON, status code)
    """
    response = {'success': True}
    
    if data is not None:
        response['data'] = data
    
    if message:
        response['message'] = message
        
    return jsonify(response), status


def error_response(
    message: str,
    status: int = 400,
    error_code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
) -> Response:
    """
    Create an error API response.
    
    Args:
        message: Error message
        status: HTTP status code (default 400)
        error_code: Optional error code for programmatic handling
        details: Optional additional error details
        
    Returns:
        Tuple of (response JSON, status code)
    """
    response = {
        'success': False,
        'error': message
    }
    
    if error_code:
        response['error_code'] = error_code
        
    if details:
        response['details'] = details
        
    return jsonify(response), status


def validation_error(
    message: str,
    field: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
) -> Response:
    """
    Create a validation error response (400).
    
    Args:
        message: Validation error message
        field: Optional field name that failed validation
        details: Optional additional details
        
    Returns:
        Tuple of (response JSON, status code 400)
    """
    error_details = details or {}
    if field:
        error_details['field'] = field
        
    return error_response(
        message=message,
        status=400,
        error_code='VALIDATION_ERROR',
        details=error_details if error_details else None
    )


def not_found_error(
    resource: str,
    identifier: Optional[str] = None
) -> Response:
    """
    Create a not found error response (404).
    
    Args:
        resource: Type of resource not found
        identifier: Optional identifier of the resource
        
    Returns:
        Tuple of (response JSON, status code 404)
    """
    message = f'{resource} not found'
    if identifier:
        message = f'{resource} "{identifier}" not found'
        
    return error_response(
        message=message,
        status=404,
        error_code='NOT_FOUND'
    )


def server_error(
    message: str = 'An internal server error occurred',
    exception: Optional[Exception] = None
) -> Response:
    """
    Create a server error response (500).
    
    Args:
        message: Error message
        exception: Optional exception to log
        
    Returns:
        Tuple of (response JSON, status code 500)
    """
    if exception:
        log_error(f"{message}: {str(exception)}", exc_info=True)
    
    return error_response(
        message=message,
        status=500,
        error_code='SERVER_ERROR'
    )


def handle_exceptions(f):
    """
    Decorator to handle exceptions in route handlers.
    
    Catches exceptions and returns appropriate error responses.
    
    Usage:
        @app.route('/api/endpoint')
        @handle_exceptions
        def my_endpoint():
            ...
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ValueError as e:
            return validation_error(str(e))
        except FileNotFoundError as e:
            return not_found_error('Resource', str(e))
        except Exception as e:
            return server_error(f'Error in {f.__name__}', exception=e)
    return decorated_function
