/**
 * BaseWidget Component
 * 
 * A base component that provides common functionality for dashboard widgets.
 * Extend this component or use it as a wrapper for your custom widgets.
 * 
 * @module widgets/BaseWidget
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import './BaseWidget.css';

/**
 * Widget loading state indicator
 */
const LoadingIndicator = ({ message = 'Loading...' }) => (
  <div className="widget-loading">
    <div className="widget-loading-spinner"></div>
    <span>{message}</span>
  </div>
);

/**
 * Widget error state indicator
 */
const ErrorIndicator = ({ error, onRetry }) => (
  <div className="widget-error">
    <span className="widget-error-icon">⚠️</span>
    <span className="widget-error-message">{error}</span>
    {onRetry && (
      <button className="widget-error-retry" onClick={onRetry}>
        Retry
      </button>
    )}
  </div>
);

/**
 * Widget empty state indicator
 */
const EmptyState = ({ message = 'No data available', icon = '📭' }) => (
  <div className="widget-empty">
    <span className="widget-empty-icon">{icon}</span>
    <span className="widget-empty-message">{message}</span>
  </div>
);

/**
 * BaseWidget Component
 * 
 * Provides common widget functionality including:
 * - Loading states
 * - Error handling
 * - Empty states
 * - Refresh capability
 * - Toolbar support
 * 
 * @example
 * // Using BaseWidget as a wrapper
 * function MyWidget({ data }) {
 *   return (
 *     <BaseWidget
 *       title="My Widget"
 *       isLoading={!data}
 *       isEmpty={data && data.length === 0}
 *       emptyMessage="No items found"
 *     >
 *       {data.map(item => <div key={item.id}>{item.name}</div>)}
 *     </BaseWidget>
 *   );
 * }
 */
const BaseWidget = ({
  children,
  title,
  className = '',
  isLoading = false,
  loadingMessage = 'Loading...',
  error = null,
  onRetry = null,
  isEmpty = false,
  emptyMessage = 'No data available',
  emptyIcon = '📭',
  toolbar = null,
  footer = null,
  onRefresh = null,
  refreshInterval = null,
  style = {},
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Handle manual refresh
  const handleRefresh = useCallback(async () => {
    if (!onRefresh || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, isRefreshing]);

  // Auto-refresh interval
  useEffect(() => {
    if (!refreshInterval || !onRefresh) return;

    const intervalId = setInterval(() => {
      onRefresh();
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval, onRefresh]);

  // Render content based on state
  const renderContent = () => {
    if (error) {
      return <ErrorIndicator error={error} onRetry={onRetry || handleRefresh} />;
    }

    if (isLoading) {
      return <LoadingIndicator message={loadingMessage} />;
    }

    if (isEmpty) {
      return <EmptyState message={emptyMessage} icon={emptyIcon} />;
    }

    return children;
  };

  return (
    <div className={`base-widget ${className}`} style={style}>
      {/* Widget Header */}
      {(title || toolbar || onRefresh) && (
        <div className="base-widget-header">
          {title && <h4 className="base-widget-title">{title}</h4>}
          <div className="base-widget-toolbar">
            {toolbar}
            {onRefresh && (
              <button 
                className={`widget-refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh"
              >
                🔄
              </button>
            )}
          </div>
        </div>
      )}

      {/* Widget Content */}
      <div className="base-widget-content">
        {renderContent()}
      </div>

      {/* Widget Footer */}
      {footer && (
        <div className="base-widget-footer">
          {footer}
        </div>
      )}
    </div>
  );
};

BaseWidget.propTypes = {
  /** Widget content */
  children: PropTypes.node,
  /** Widget title displayed in header */
  title: PropTypes.string,
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Loading state */
  isLoading: PropTypes.bool,
  /** Custom loading message */
  loadingMessage: PropTypes.string,
  /** Error message (shows error state if set) */
  error: PropTypes.string,
  /** Callback for retry button */
  onRetry: PropTypes.func,
  /** Empty state (shows empty message if true) */
  isEmpty: PropTypes.bool,
  /** Custom empty state message */
  emptyMessage: PropTypes.string,
  /** Custom empty state icon */
  emptyIcon: PropTypes.string,
  /** Toolbar content (rendered in header) */
  toolbar: PropTypes.node,
  /** Footer content */
  footer: PropTypes.node,
  /** Callback for refresh button */
  onRefresh: PropTypes.func,
  /** Auto-refresh interval in milliseconds */
  refreshInterval: PropTypes.number,
  /** Custom inline styles */
  style: PropTypes.object,
};

// Export sub-components for custom usage
export { LoadingIndicator, ErrorIndicator, EmptyState };
export default BaseWidget;
