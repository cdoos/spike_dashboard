import React, { useState, useCallback } from 'react';
import './Upload.css';

const Upload = ({ onUploadComplete, onClose }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState(null);
  const [dataFile, setDataFile] = useState(null);
  const [spikeTimesFile, setSpikeTimesFile] = useState(null);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setDataFile(files[0]);
    }
  }, []);

  const handleDataFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setDataFile(files[0]);
    }
  };

  const handleSpikeTimesFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSpikeTimesFile(files[0]);
    }
  };

  const handleFileUpload = async () => {
    if (!dataFile) {
      setError('Please select a data file');
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgress(0);
    setUploadStatus(`Uploading ${dataFile.name}...`);

    const formData = new FormData();
    formData.append('file', dataFile);
    if (spikeTimesFile) {
      formData.append('spike_times_file', spikeTimesFile);
    }

    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setUploadStatus(`Successfully uploaded ${response.filename} (${response.sizeFormatted})`);
          setUploadProgress(100);
          setTimeout(() => {
            if (onUploadComplete) {
              onUploadComplete(response);
            }
          }, 1500);
        } else {
          const error = JSON.parse(xhr.responseText);
          setError(error.error || 'Upload failed');
          setUploading(false);
        }
      });

      xhr.addEventListener('error', () => {
        setError('Network error during upload');
        setUploading(false);
      });

      xhr.open('POST', `${apiUrl}/api/dataset/upload`);
      xhr.send(formData);

    } catch (err) {
      setError(err.message || 'Upload failed');
      setUploading(false);
    }
  };

  return (
    <div className="upload-overlay">
      <div className="upload-modal">
        <div className="upload-header">
          <h2>Upload Dataset</h2>
          <button className="close-button" onClick={onClose} disabled={uploading}>
            ×
          </button>
        </div>

        <div className="upload-body">
          {!uploading ? (
            <>
              <div
                className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="upload-icon">📁</div>
                <p className="upload-text">
                  {dataFile ? `Selected: ${dataFile.name}` : 'Drag and drop your dataset file here'}
                </p>
                <p className="upload-subtext">or</p>
                <label className="upload-button">
                  Choose Data File
                  <input
                    type="file"
                    accept=".bin,.dat,.raw,.pt"
                    onChange={handleDataFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>
                <p className="upload-hint">
                  Supported formats: .bin, .dat, .raw, .pt
                </p>
              </div>

              <div className="spike-times-section">
                <p className="spike-times-label">
                  📊 Spike Times File (Optional)
                </p>
                <div className="spike-times-file-selector">
                  <label className="spike-times-button">
                    {spikeTimesFile ? `✓ ${spikeTimesFile.name}` : 'Choose Spike Times (.pt)'}
                    <input
                      type="file"
                      accept=".pt"
                      onChange={handleSpikeTimesFileSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {spikeTimesFile && (
                    <button 
                      className="clear-spike-times-button"
                      onClick={() => setSpikeTimesFile(null)}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className="spike-times-hint">
                  Upload pre-computed spike times to enable the "Use Pre-computed Spikes" visualization mode. File should be a PyTorch .pt file containing spike timestamps (list, tensor, or dict with channel IDs as keys).
                </p>
              </div>

              <button 
                className="upload-submit-button" 
                onClick={handleFileUpload}
                disabled={!dataFile}
              >
                Upload
              </button>
            </>
          ) : (
            <div className="upload-progress-container">
              <div className="upload-progress-text">{uploadStatus}</div>
              <div className="upload-progress-bar">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="upload-progress-percent">
                {uploadProgress.toFixed(1)}%
              </div>
            </div>
          )}

          {error && (
            <div className="upload-error">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Upload;


