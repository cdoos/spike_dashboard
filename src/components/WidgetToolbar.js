import React, { useState, useEffect, useRef } from 'react';
import './WidgetToolbar.css';

const WidgetToolbar = ({ widgets, onToggleWidget, onResetLayout }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localWidgets, setLocalWidgets] = useState(widgets);
  const toolbarRef = useRef(null);

  // Update local state when widgets prop changes
  useEffect(() => {
    setLocalWidgets(widgets);
  }, [widgets]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isExpanded]);

  const handleToggle = (widgetId) => {
    // Update local state immediately for instant feedback
    setLocalWidgets(prev => 
      prev.map(w => w.id === widgetId ? { ...w, visible: !w.visible } : w)
    );
    onToggleWidget(widgetId);
  };

  return (
    <div className="widget-toolbar" ref={toolbarRef}>
      <button
        className="toolbar-toggle-btn"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        title={isExpanded ? "Hide Widget Controls" : "Show Widget Controls"}
      >
        <span className="toolbar-icon">☰</span>
        <span className="toolbar-label">Widgets</span>
        <span className={`toolbar-arrow ${isExpanded ? 'expanded' : ''}`}>▼</span>
      </button>

      {isExpanded && (
        <div className="toolbar-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="toolbar-header">
            <span>Manage Widgets</span>
            <button
              className="reset-layout-btn"
              onClick={(e) => {
                e.stopPropagation();
                onResetLayout();
              }}
              title="Reset Layout"
            >
              Reset
            </button>
          </div>
          <div className="toolbar-widget-list">
            {localWidgets.map(widget => (
              <div
                key={widget.id}
                className={`toolbar-widget-item ${widget.visible ? 'visible' : 'hidden'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(widget.id);
                }}
              >
                <input
                  type="checkbox"
                  checked={widget.visible}
                  onChange={() => handleToggle(widget.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="widget-item-name">{widget.name}</span>
                <span className={`widget-status-icon ${widget.visible ? 'visible' : 'hidden'}`}>
                  {widget.visible ? '👁' : '👁‍🗨'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WidgetToolbar;
