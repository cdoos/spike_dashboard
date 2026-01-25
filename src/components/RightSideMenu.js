import React, { useState } from 'react';
import ViewManager from './ViewManager';
import './RightSideMenu.css';

const RightSideMenu = ({
  isWidgetBankOpen,
  onWidgetBankToggle,
  widgetStates,
  onViewChange,
  getWidgetPositionsAndSizes,
  algorithms,
  selectedAlgorithm,
  onAlgorithmChange,
  onRunAlgorithm,
  isRunningAlgorithm,
  onOpenParameters
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Check if parameters button should be shown
  const selectedAlgo = algorithms?.find(a => a.name === selectedAlgorithm);
  const showParametersButton = (selectedAlgo?.name === 'torchbci_jims' || selectedAlgo?.name === 'kilosort4') && selectedAlgo?.available;

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Tab/Handle on the right edge */}
      <div 
        className={`right-menu-tab ${isOpen ? 'open' : ''}`}
        onClick={handleToggle}
        title={isOpen ? "Close menu" : "Open menu"}
      >
        <span className="tab-icon">{isOpen ? '›' : '‹'}</span>
        <span className="tab-text">Menu</span>
      </div>

      {/* Slide-out Panel */}
      <div className={`right-side-menu ${isOpen ? 'open' : ''}`}>
        <div className="right-menu-header">
          <h3>Controls</h3>
          <button className="close-menu-btn" onClick={handleToggle}>
            ✕
          </button>
        </div>

        <div className="right-menu-content">
          {/* Widgets Section */}
          <div className="menu-section">
            <div className="section-label">Widgets</div>
            <button
              className={`menu-widget-btn ${isWidgetBankOpen ? 'active' : ''}`}
              onClick={onWidgetBankToggle}
              title="Open Widget Bank"
            >
              <span className="btn-icon">🧩</span>
              <span className="btn-label">Widget Bank</span>
              <span className={`btn-arrow ${isWidgetBankOpen ? 'open' : ''}`}>▼</span>
            </button>
          </div>

          {/* Layout Section */}
          <div className="menu-section">
            <div className="section-label">Layout</div>
            <ViewManager
              currentWidgetStates={widgetStates}
              onViewChange={onViewChange}
              getWidgetPositionsAndSizes={getWidgetPositionsAndSizes}
            />
          </div>

          {/* Algorithm Section */}
          <div className="menu-section">
            <div className="section-label">Algorithm</div>
            <div className="algorithm-controls">
              <select
                className="menu-select"
                value={selectedAlgorithm}
                onChange={(e) => onAlgorithmChange(e.target.value)}
                disabled={!algorithms || algorithms.length === 0}
              >
                {algorithms && algorithms.map((algo) => (
                  <option key={algo.name} value={algo.name} disabled={!algo.available}>
                    {algo.displayName}{!algo.available ? ' (unavailable)' : ''}
                  </option>
                ))}
              </select>

              <div className="algorithm-actions">
                {showParametersButton && (
                  <button
                    className="menu-params-btn"
                    onClick={onOpenParameters}
                    title="Configure algorithm parameters"
                  >
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v6m0 6v6m8.66-13.66l-4.24 4.24m-4.24 4.24L7.34 22.66M23 12h-6m-6 0H1m20.66 8.66l-4.24-4.24m-4.24-4.24L1.34 1.34" />
                    </svg>
                  </button>
                )}

                <button
                  className="menu-run-btn"
                  onClick={onRunAlgorithm}
                  disabled={!selectedAlgorithm || isRunningAlgorithm}
                  title={isRunningAlgorithm ? "Algorithm is running..." : "Run spike sorting algorithm"}
                >
                  {isRunningAlgorithm ? (
                    <>
                      <span className="spinner"></span>
                      Running...
                    </>
                  ) : (
                    <>
                      <span className="run-icon">▶</span>
                      Run
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay when menu is open */}
      {isOpen && <div className="right-menu-overlay" onClick={handleToggle} />}
    </>
  );
};

export default RightSideMenu;
