import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useClickOutside } from '../hooks';
import './DatasetSelector.css';

/**
 * DatasetSelector Component
 * 
 * Dropdown selector for choosing and managing datasets.
 * Supports dataset selection and deletion.
 */
const DatasetSelector = ({ datasets, currentDataset, onDatasetChange, onDatasetDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleClose = useCallback(() => setIsOpen(false), []);
  const dropdownRef = useClickOutside(handleClose, isOpen);

  const handleDelete = (e, datasetName) => {
    e.stopPropagation();
    onDatasetDelete(datasetName);
  };

  const handleSelect = (datasetName) => {
    if (datasetName !== currentDataset) {
      onDatasetChange(datasetName);
    }
    setIsOpen(false);
  };

  const currentDatasetInfo = datasets.find(d => d.name === currentDataset);

  return (
    <div className="dataset-selector-custom" ref={dropdownRef}>
      <label>Dataset:</label>
      <div className="dataset-select-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span className="dataset-select-value">
          {currentDatasetInfo 
            ? `${currentDatasetInfo.name} (${currentDatasetInfo.sizeFormatted})`
            : 'No datasets available'
          }
        </span>
        <svg 
          className={`dropdown-arrow ${isOpen ? 'open' : ''}`}
          width="12" 
          height="12" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {isOpen && datasets.length > 0 && (
        <div className="dataset-dropdown-menu">
          {datasets.map((dataset) => (
            <div
              key={dataset.name}
              className={`dataset-option ${dataset.name === currentDataset ? 'active' : ''}`}
              onClick={() => handleSelect(dataset.name)}
            >
              <div className="dataset-info">
                <span className="dataset-name">{dataset.name}</span>
                <span className="dataset-size">{dataset.sizeFormatted}</span>
              </div>
              <button
                className="delete-dataset-btn"
                onClick={(e) => handleDelete(e, dataset.name)}
                title="Delete dataset"
              >
                <svg 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

DatasetSelector.propTypes = {
  /** Array of available datasets */
  datasets: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    size: PropTypes.number,
    sizeFormatted: PropTypes.string,
  })).isRequired,
  /** Currently selected dataset name */
  currentDataset: PropTypes.string,
  /** Callback when dataset is selected */
  onDatasetChange: PropTypes.func.isRequired,
  /** Callback when dataset delete is requested */
  onDatasetDelete: PropTypes.func.isRequired,
};

DatasetSelector.defaultProps = {
  currentDataset: null,
};

export default DatasetSelector;
