"""
Authentication Utilities

Provides JWT token generation, validation, and authentication decorators.
"""

import os
import jwt
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, current_app, g

from app.models.user import User, UserRole
from app.logger import get_logger

logger = get_logger(__name__)

# JWT Configuration
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'spike-dashboard-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', 24))


def generate_token(user):
    """
    Generate a JWT token for a user.
    
    Args:
        user: User model instance
        
    Returns:
        str: JWT token
    """
    payload = {
        'user_id': user.id,
        'username': user.username,
        'role': user.role.value,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow(),
    }
    
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token


def decode_token(token):
    """
    Decode and validate a JWT token.
    
    Args:
        token: JWT token string
        
    Returns:
        dict: Token payload or None if invalid
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning('Token has expired')
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f'Invalid token: {e}')
        return None


def get_token_from_request():
    """
    Extract JWT token from request headers.
    
    Looks for:
    - Authorization: Bearer <token>
    - X-Auth-Token: <token>
    
    Returns:
        str: Token or None
    """
    # Check Authorization header
    auth_header = request.headers.get('Authorization')
    if auth_header:
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == 'bearer':
            return parts[1]
    
    # Check X-Auth-Token header
    token = request.headers.get('X-Auth-Token')
    if token:
        return token
    
    return None


def get_current_user():
    """
    Get the current authenticated user from the request.
    
    Returns:
        User: Current user or None
    """
    # Check if already cached in request context
    if hasattr(g, 'current_user'):
        return g.current_user
    
    token = get_token_from_request()
    if not token:
        return None
    
    payload = decode_token(token)
    if not payload:
        return None
    
    user = User.query.get(payload['user_id'])
    if user and user.is_active:
        g.current_user = user
        return user
    
    return None


def login_required(f):
    """
    Decorator to require authentication for a route.
    
    Usage:
        @app.route('/protected')
        @login_required
        def protected_route():
            return 'Protected content'
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({
                'success': False,
                'error': 'Authentication required',
                'error_code': 'AUTH_REQUIRED'
            }), 401
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """
    Decorator to require admin role for a route.
    
    Usage:
        @app.route('/admin-only')
        @admin_required
        def admin_route():
            return 'Admin content'
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({
                'success': False,
                'error': 'Authentication required',
                'error_code': 'AUTH_REQUIRED'
            }), 401
        if not user.is_admin():
            return jsonify({
                'success': False,
                'error': 'Admin access required',
                'error_code': 'ADMIN_REQUIRED'
            }), 403
        return f(*args, **kwargs)
    return decorated_function


def role_required(allowed_roles):
    """
    Decorator factory to require specific roles.
    
    Args:
        allowed_roles: List of UserRole values
        
    Usage:
        @app.route('/specific-role')
        @role_required([UserRole.ADMIN, UserRole.USER])
        def role_route():
            return 'Role-specific content'
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({
                    'success': False,
                    'error': 'Authentication required',
                    'error_code': 'AUTH_REQUIRED'
                }), 401
            if user.role not in allowed_roles:
                return jsonify({
                    'success': False,
                    'error': 'Insufficient permissions',
                    'error_code': 'INSUFFICIENT_PERMISSIONS'
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def check_algorithm_access(user, algorithm):
    """
    Check if a user has access to a specific algorithm.
    
    Args:
        user: User model instance
        algorithm: Algorithm identifier string
        
    Returns:
        bool: True if user has access
    """
    if not user:
        return False
    
    allowed = user.get_allowed_algorithms()
    return algorithm in allowed


def algorithm_access_required(f):
    """
    Decorator to check algorithm access based on user role.
    
    Expects 'algorithm' in request JSON body or query params.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({
                'success': False,
                'error': 'Authentication required',
                'error_code': 'AUTH_REQUIRED'
            }), 401
        
        # Get algorithm from request
        algorithm = None
        if request.is_json:
            algorithm = request.json.get('algorithm')
        if not algorithm:
            algorithm = request.args.get('algorithm')
        
        if algorithm and not check_algorithm_access(user, algorithm):
            return jsonify({
                'success': False,
                'error': f'Access denied to algorithm: {algorithm}',
                'error_code': 'ALGORITHM_ACCESS_DENIED'
            }), 403
        
        return f(*args, **kwargs)
    return decorated_function
