/**
 * Protected Route Component
 * 
 * Wraps routes that require authentication or specific roles.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Loading Spinner Component
 */
const LoadingSpinner = () => (
  <div className="auth-loading">
    <div className="auth-loading-spinner"></div>
    <p>Loading...</p>
    <style>{`
      .auth-loading {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        color: #e0e6ed;
        gap: 16px;
      }
      .auth-loading-spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(64, 224, 208, 0.2);
        border-top-color: #40e0d0;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

/**
 * Protected Route - Requires authentication
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render
 * @param {boolean} props.requireAdmin - Whether admin role is required
 */
export function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  // Show loading while checking auth
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/**
 * Public Route - Only accessible when NOT authenticated
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render
 */
export function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading while checking auth
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Redirect to home if already authenticated
  if (isAuthenticated) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  return children;
}

export default ProtectedRoute;
