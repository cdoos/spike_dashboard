import React, { useState, useEffect, useRef } from 'react';
import './AlgorithmParametersMenu.css';

const AlgorithmParametersMenu = ({ isOpen, onClose, parameters, onSave, algorithm }) => {
  const [localParams, setLocalParams] = useState(parameters);
  const menuRef = useRef(null);

  useEffect(() => {
    setLocalParams(parameters);
  }, [parameters]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (paramName, value) => {
    setLocalParams(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  const handleSave = () => {
    onSave(localParams);
    onClose();
  };

  const handleReset = () => {
    // Reset to default values based on algorithm
    let defaults;
    if (algorithm === 'kilosort4') {
      defaults = {
        probe_path: 'torchbci/data/NeuroPix1_default.mat',
        sampling_rate: 30000
      };
    } else {
      // TorchBCI Jims defaults
      defaults = {
        window_size: 3,
        threshold: 36,
        frame_size: 13,
        normalize: 'zscore',
        sort_by: 'value',
        leniency_channel: 7,
        leniency_time: 32,
        similarity_mode: 'cosine',
        outlier_threshold: 0.8,
        n_clusters: 8,
        cluster_feature_size: 7,
        n_jims_features: 7,
        pad_value: 0
      };
    }
    setLocalParams(defaults);
  };

  return (
    <div className="algorithm-params-overlay">
      <div className="algorithm-params-menu" ref={menuRef}>
        <div className="params-header">
          <h3>Algorithm Parameters</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="params-content">
          {algorithm === 'kilosort4' ? (
            // Kilosort4 parameters
            <>
              <div className="param-group">
                <label>Probe Path</label>
                <input
                  type="text"
                  value={localParams.probe_path || ''}
                  onChange={(e) => handleChange('probe_path', e.target.value)}
                  placeholder="torchbci/data/NeuroPix1_default.mat"
                />
                <small>Path to probe configuration file</small>
              </div>

              <div className="param-group">
                <label>Sampling Rate (Hz)</label>
                <input
                  type="number"
                  value={localParams.sampling_rate || 30000}
                  onChange={(e) => handleChange('sampling_rate', parseInt(e.target.value))}
                  min="1000"
                />
                <small>Recording sampling rate</small>
              </div>
            </>
          ) : (
            // TorchBCI Jims parameters
            <>
              <div className="param-group">
                <label>Window Size</label>
                <input
                  type="number"
                  value={localParams.window_size}
                  onChange={(e) => handleChange('window_size', parseInt(e.target.value))}
                  min="1"
                />
              </div>

          <div className="param-group">
            <label>Threshold</label>
            <input
              type="number"
              value={localParams.threshold}
              onChange={(e) => handleChange('threshold', parseInt(e.target.value))}
              min="1"
            />
          </div>

          <div className="param-group">
            <label>Frame Size</label>
            <input
              type="number"
              value={localParams.frame_size}
              onChange={(e) => handleChange('frame_size', parseInt(e.target.value))}
              min="1"
            />
          </div>

          <div className="param-group">
            <label>Normalize</label>
            <select
              value={localParams.normalize}
              onChange={(e) => handleChange('normalize', e.target.value)}
            >
              <option value="zscore">Z-Score</option>
              <option value="none">None</option>
            </select>
          </div>

          <div className="param-group">
            <label>Sort By</label>
            <select
              value={localParams.sort_by}
              onChange={(e) => handleChange('sort_by', e.target.value)}
            >
              <option value="value">Value</option>
              <option value="time">Time</option>
            </select>
          </div>

          <div className="param-group">
            <label>Leniency Channel</label>
            <input
              type="number"
              value={localParams.leniency_channel}
              onChange={(e) => handleChange('leniency_channel', parseInt(e.target.value))}
              min="0"
            />
          </div>

          <div className="param-group">
            <label>Leniency Time</label>
            <input
              type="number"
              value={localParams.leniency_time}
              onChange={(e) => handleChange('leniency_time', parseInt(e.target.value))}
              min="0"
            />
          </div>

          <div className="param-group">
            <label>Similarity Mode</label>
            <select
              value={localParams.similarity_mode}
              onChange={(e) => handleChange('similarity_mode', e.target.value)}
            >
              <option value="cosine">Cosine</option>
              <option value="euclidean">Euclidean</option>
            </select>
          </div>

          <div className="param-group">
            <label>Outlier Threshold</label>
            <input
              type="number"
              step="0.1"
              value={localParams.outlier_threshold}
              onChange={(e) => handleChange('outlier_threshold', parseFloat(e.target.value))}
              min="0"
              max="1"
            />
          </div>

          <div className="param-group">
            <label>Number of Clusters</label>
            <input
              type="number"
              value={localParams.n_clusters}
              onChange={(e) => handleChange('n_clusters', parseInt(e.target.value))}
              min="1"
            />
          </div>

          <div className="param-group">
            <label>Cluster Feature Size</label>
            <input
              type="number"
              value={localParams.cluster_feature_size}
              onChange={(e) => handleChange('cluster_feature_size', parseInt(e.target.value))}
              min="1"
            />
          </div>

          <div className="param-group">
            <label>JIMS Features</label>
            <input
              type="number"
              value={localParams.n_jims_features}
              onChange={(e) => handleChange('n_jims_features', parseInt(e.target.value))}
              min="1"
            />
          </div>

              <div className="param-group">
                <label>Pad Value</label>
                <input
                  type="number"
                  value={localParams.pad_value}
                  onChange={(e) => handleChange('pad_value', parseInt(e.target.value))}
                />
              </div>
            </>
          )}
        </div>

        <div className="params-footer">
          <button className="reset-button" onClick={handleReset}>Reset to Defaults</button>
          <div className="footer-actions">
            <button className="cancel-button" onClick={onClose}>Cancel</button>
            <button className="save-button" onClick={handleSave}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlgorithmParametersMenu;

