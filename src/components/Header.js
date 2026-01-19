import React, { useState, useEffect, useCallback } from 'react';
import DatasetSelector from './DatasetSelector';
import ViewManager from './ViewManager';
import './Header.css';

const Header = ({
  totalChannels,
  activeChannels,
  datasets,
  currentDataset,
  onDatasetChange,
  onUploadClick,
  onDatasetDelete,
  selectedView,
  onViewChange,
  selectedSignalType,
  onSignalTypeChange,
  algorithms,
  selectedAlgorithm,
  onAlgorithmChange,
  onRunAlgorithm,
  isRunningAlgorithm,
  onOpenParameters,
  multiPanelViewRef
}) => {
  const [isWidgetBankOpen, setIsWidgetBankOpen] = useState(false);
  const [widgetStates, setWidgetStates] = useState({});

  // Check if the selected algorithm supports parameters (TorchBCI Algorithm or Kilosort4)
  const selectedAlgo = algorithms?.find(a => a.name === selectedAlgorithm);
  const showParametersButton = selectedView === 'multipanel' &&
    (selectedAlgo?.name === 'torchbci_jims' || selectedAlgo?.name === 'kilosort4') &&
    selectedAlgo?.available;

  // Show widget bank button only in multi-panel view
  const showMultiPanelControls = selectedView === 'multipanel' && multiPanelViewRef?.current;

  // Sync states from MultiPanelView
  useEffect(() => {
    if (showMultiPanelControls && multiPanelViewRef.current) {
      const syncState = () => {
        if (multiPanelViewRef.current.isWidgetBankOpen !== undefined) {
          setIsWidgetBankOpen(multiPanelViewRef.current.isWidgetBankOpen);
        }
        if (multiPanelViewRef.current.widgetStates) {
          setWidgetStates(multiPanelViewRef.current.widgetStates);
        }
      };
      syncState();
      const interval = setInterval(syncState, 100);
      return () => clearInterval(interval);
    }
  }, [showMultiPanelControls]);

  // Handle widget bank toggle
  const handleWidgetBankToggle = () => {
    if (multiPanelViewRef?.current?.setIsWidgetBankOpen) {
      multiPanelViewRef.current.setIsWidgetBankOpen(!isWidgetBankOpen);
      setIsWidgetBankOpen(!isWidgetBankOpen);
    }
  };

  // Handle view change from ViewManager
  const handleLayoutViewChange = useCallback((newWidgetStates) => {
    if (multiPanelViewRef?.current?.handleViewChange) {
      multiPanelViewRef.current.handleViewChange(newWidgetStates);
    }
  }, [multiPanelViewRef]);

  // Get widget positions and sizes
  const getWidgetPositionsAndSizes = useCallback(() => {
    if (multiPanelViewRef?.current?.getWidgetPositionsAndSizes) {
      return multiPanelViewRef.current.getWidgetPositionsAndSizes();
    }
    return {};
  }, [multiPanelViewRef]);

  return (
    <div className="header">
      <div className="header-left">
        <h1>Spike Visualization Dashboard</h1>
        
        {showMultiPanelControls && (
          <>
            <button
              className={`widget-bank-toggle ${isWidgetBankOpen ? 'active' : ''}`}
              onClick={handleWidgetBankToggle}
              title="Open Widget Bank"
            >
              <span className="widget-bank-icon">🧩</span>
              <span className="widget-bank-label">Widgets</span>
              <span className={`widget-bank-arrow ${isWidgetBankOpen ? 'open' : ''}`}>▼</span>
            </button>

            <ViewManager
              currentWidgetStates={widgetStates}
              onViewChange={handleLayoutViewChange}
              getWidgetPositionsAndSizes={getWidgetPositionsAndSizes}
            />
          </>
        )}
      </div>

      <div className="header-controls">
        {showParametersButton && (
          <button
            className="parameters-button"
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

        {selectedView === 'multipanel' && (
          <>
            <div className="view-selector-container">
              <label htmlFor="algorithm-select">Algorithm:</label>
              <select
                id="algorithm-select"
                className="view-selector"
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
            </div>

            <button
              className="run-algorithm-button"
              onClick={onRunAlgorithm}
              disabled={!selectedAlgorithm || isRunningAlgorithm}
              title={isRunningAlgorithm ? "Algorithm is running..." : "Run spike sorting algorithm"}
            >
              {isRunningAlgorithm ? 'Running...' : 'Run'}
            </button>
          </>
        )}

        {selectedView === 'signal' && (
          <div className="view-selector-container">
            <label htmlFor="signal-type-select">Signal Type:</label>
            <select
              id="signal-type-select"
              className="view-selector"
              value={selectedSignalType}
              onChange={(e) => onSignalTypeChange(e.target.value)}
            >
              <option value="raw">Raw Data</option>
              <option value="filtered">Filtered Data</option>
              <option value="spikes">Detected Spikes</option>
            </select>
          </div>
        )}

        <div className="view-selector-container">
          <label htmlFor="view-select">View:</label>
          <select
            id="view-select"
            className="view-selector"
            value={selectedView}
            onChange={(e) => onViewChange(e.target.value)}
          >
            <option value="signal">Signal View</option>
            <option value="clusters">Cluster View</option>
            <option value="multipanel">Multi-Panel View</option>
            <option value="runtime">Runtime Analysis View</option>
          </select>
        </div>

        <DatasetSelector
          datasets={datasets}
          currentDataset={currentDataset}
          onDatasetChange={onDatasetChange}
          onDatasetDelete={onDatasetDelete}
        />

        <button 
          className="upload-button-header" 
          onClick={onUploadClick}
          title="Upload new dataset"
        >
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Header;
