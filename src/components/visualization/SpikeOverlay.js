/**
 * SpikeOverlay Component
 * 
 * Displays overlaid spike waveforms for comparison across clusters.
 */

import React from 'react';
import PropTypes from 'prop-types';
import Plot from 'react-plotly.js';
import { THEME_COLORS, getClusterColor } from '../../utils/colors';
import { DEFAULT_CONFIG, DARK_THEME_LAYOUT, DARK_THEME_AXIS } from '../../utils/plotlyConfig';

/**
 * Generate plot data for overlay visualization
 */
const generateOverlayPlotData = (spikes) => {
  if (!spikes || spikes.length === 0) return [];

  return spikes.map((spike, idx) => {
    if (!spike.waveform) return null;

    const x = Array.from({ length: spike.waveform.length }, (_, i) => 
      (i - Math.floor(spike.waveform.length / 2)) / 30
    );

    return {
      type: 'scatter',
      mode: 'lines',
      x: x,
      y: spike.waveform,
      name: `C${spike.clusterIndex + 1} P${spike.pointIndex}`,
      line: {
        color: spike.color || getClusterColor(spike.clusterIndex),
        width: 1.5,
      },
      hovertemplate: `<b>Cluster ${spike.clusterIndex + 1}</b><br>` +
        `Point ${spike.pointIndex}<br>` +
        `Channel ${spike.channelId}<br>` +
        `Time: ${spike.spikeTime}<extra></extra>`,
    };
  }).filter(Boolean);
};

/**
 * Spike Overlay Component
 * 
 * Shows multiple spike waveforms overlaid for visual comparison.
 */
const SpikeOverlay = ({
  spikes,
  isLoading,
  onClearAll,
  onRemoveSpike,
  onNavigateToSpike,
}) => {
  if (!spikes || spikes.length === 0) return null;

  const overlayLayout = {
    ...DARK_THEME_LAYOUT,
    showlegend: true,
    legend: {
      x: 1,
      xanchor: 'right',
      y: 1,
      bgcolor: 'rgba(26, 26, 46, 0.8)',
      bordercolor: THEME_COLORS.border,
      borderwidth: 1,
      font: { size: 10 },
    },
    xaxis: {
      ...DARK_THEME_AXIS,
      title: 'Time (ms)',
    },
    yaxis: {
      ...DARK_THEME_AXIS,
      title: 'Amplitude',
    },
    margin: { l: 50, r: 20, t: 10, b: 40 },
  };

  return (
    <div className="spike-overlay-container">
      <div 
        className="overlay-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '14px', color: THEME_COLORS.text }}>
          Spike Overlay Comparison
        </h3>
        <div className="overlay-controls" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span 
            className="spike-count"
            style={{ fontSize: '12px', color: THEME_COLORS.textMuted }}
          >
            {spikes.length} spike{spikes.length !== 1 ? 's' : ''}
          </span>
          <button 
            className="clear-overlay-btn" 
            onClick={onClearAll}
            style={{
              padding: '4px 10px',
              background: 'rgba(255, 107, 107, 0.2)',
              border: '1px solid rgba(255, 107, 107, 0.4)',
              borderRadius: '4px',
              color: THEME_COLORS.error,
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Clear All
          </button>
        </div>
      </div>
      
      <div className="overlay-plot" style={{ height: '200px' }}>
        {isLoading ? (
          <div 
            className="overlay-loading"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: THEME_COLORS.textMuted,
            }}
          >
            Loading spike...
          </div>
        ) : (
          <Plot
            data={generateOverlayPlotData(spikes)}
            layout={overlayLayout}
            config={DEFAULT_CONFIG}
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>
      
      <div className="overlay-spike-list-compact" style={{ marginTop: '10px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: THEME_COLORS.textMuted }}>
          Selected Spikes:
        </h4>
        <div 
          className="spike-list-items-compact"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          {spikes.map((spike, idx) => (
            <div 
              key={idx} 
              className="spike-list-item-compact"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 8px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '4px',
                borderLeft: `3px solid ${spike.color || getClusterColor(spike.clusterIndex)}`,
              }}
            >
              <div className="spike-item-info-compact">
                <span 
                  className="spike-item-label-compact"
                  style={{ fontSize: '11px', color: THEME_COLORS.text }}
                >
                  C{spike.clusterIndex + 1} CH{spike.channelId}
                </span>
              </div>
              <div className="spike-item-actions-compact" style={{ display: 'flex', gap: '4px' }}>
                {onNavigateToSpike && (
                  <button 
                    className="spike-item-nav-btn-compact" 
                    onClick={() => onNavigateToSpike(spike)}
                    title="Navigate to spike"
                    style={{
                      padding: '2px 6px',
                      background: 'transparent',
                      border: '1px solid rgba(64, 224, 208, 0.3)',
                      borderRadius: '3px',
                      color: THEME_COLORS.primary,
                      fontSize: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    →
                  </button>
                )}
                <button 
                  className="spike-item-remove-btn-compact" 
                  onClick={() => onRemoveSpike(idx)}
                  title="Remove from overlay"
                  style={{
                    padding: '2px 6px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    borderRadius: '3px',
                    color: THEME_COLORS.error,
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

SpikeOverlay.propTypes = {
  /** Array of spike data for overlay */
  spikes: PropTypes.arrayOf(PropTypes.shape({
    clusterIndex: PropTypes.number.isRequired,
    pointIndex: PropTypes.number.isRequired,
    channelId: PropTypes.number.isRequired,
    spikeTime: PropTypes.number.isRequired,
    waveform: PropTypes.arrayOf(PropTypes.number),
    color: PropTypes.string,
  })).isRequired,
  /** Loading state */
  isLoading: PropTypes.bool,
  /** Callback to clear all spikes */
  onClearAll: PropTypes.func.isRequired,
  /** Callback to remove a single spike */
  onRemoveSpike: PropTypes.func.isRequired,
  /** Callback to navigate to a spike */
  onNavigateToSpike: PropTypes.func,
};

SpikeOverlay.defaultProps = {
  isLoading: false,
  onNavigateToSpike: null,
};

export default SpikeOverlay;
