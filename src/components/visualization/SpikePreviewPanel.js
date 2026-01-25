/**
 * SpikePreviewPanel Component
 * 
 * Displays a small waveform preview when hovering over a point in the cluster plot.
 */

import React from 'react';
import PropTypes from 'prop-types';
import Plot from 'react-plotly.js';
import { THEME_COLORS } from '../../utils/colors';
import { MINIMAL_CONFIG, DARK_THEME_LAYOUT, DARK_THEME_AXIS } from '../../utils/plotlyConfig';

/**
 * Spike Preview Panel Component
 * 
 * Shows a miniature waveform visualization for a hovered spike point.
 */
const SpikePreviewPanel = ({
  hoveredPoint,
  spikePreview,
  isLoading,
  onNavigateToSpike,
  style = {},
}) => {
  if (!hoveredPoint) return null;

  const generatePreviewPlotData = () => {
    if (!spikePreview || !spikePreview.waveform) return [];

    const x = Array.from({ length: spikePreview.waveform.length }, (_, i) => 
      (i - Math.floor(spikePreview.waveform.length / 2)) / 30
    );
    const y = spikePreview.waveform;

    return [{
      type: 'scatter',
      mode: 'lines',
      x: x,
      y: y,
      line: {
        color: THEME_COLORS.primary,
        width: 2,
      },
      hovertemplate: '%{y:.1f}<extra></extra>',
    }];
  };

  const previewLayout = {
    ...DARK_THEME_LAYOUT,
    width: 200,
    height: 120,
    margin: { l: 35, r: 10, t: 10, b: 30 },
    xaxis: {
      ...DARK_THEME_AXIS,
      title: { text: 'ms', font: { size: 10 } },
      tickfont: { size: 8 },
    },
    yaxis: {
      ...DARK_THEME_AXIS,
      title: { text: '', font: { size: 10 } },
      tickfont: { size: 8 },
    },
  };

  return (
    <div 
      className="spike-preview" 
      style={{
        position: 'absolute',
        right: '10px',
        top: '10px',
        background: 'rgba(26, 26, 46, 0.95)',
        border: '1px solid rgba(64, 224, 208, 0.3)',
        borderRadius: '8px',
        padding: '12px',
        zIndex: 100,
        ...style,
      }}
    >
      <div className="preview-header" style={{ marginBottom: '8px' }}>
        <span style={{ 
          color: THEME_COLORS.text, 
          fontSize: '12px', 
          fontWeight: '600' 
        }}>
          Cluster {hoveredPoint.cluster + 1}, Point {hoveredPoint.index}
        </span>
      </div>

      {isLoading ? (
        <div 
          className="preview-loading" 
          style={{ 
            color: THEME_COLORS.textMuted, 
            fontSize: '11px',
            textAlign: 'center',
            padding: '40px 0',
          }}
        >
          Loading preview...
        </div>
      ) : spikePreview ? (
        <>
          <Plot
            data={generatePreviewPlotData()}
            layout={previewLayout}
            config={MINIMAL_CONFIG}
          />
          <div 
            className="preview-info" 
            style={{ 
              marginTop: '8px', 
              fontSize: '10px', 
              color: THEME_COLORS.textMuted 
            }}
          >
            <div>Channel: {spikePreview.channelId}</div>
            <div>Time: {spikePreview.spikeTime}</div>
            <div>Filter: {spikePreview.filterType}</div>
          </div>
          {onNavigateToSpike && (
            <button
              onClick={() => onNavigateToSpike(hoveredPoint)}
              style={{
                marginTop: '8px',
                width: '100%',
                padding: '6px',
                background: `linear-gradient(135deg, ${THEME_COLORS.primary} 0%, ${THEME_COLORS.primaryDark} 100%)`,
                border: 'none',
                borderRadius: '4px',
                color: '#0f172a',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Navigate to Spike
            </button>
          )}
        </>
      ) : (
        <div 
          style={{ 
            color: THEME_COLORS.textMuted, 
            fontSize: '11px',
            textAlign: 'center',
            padding: '40px 0',
          }}
        >
          No preview available
        </div>
      )}
    </div>
  );
};

SpikePreviewPanel.propTypes = {
  /** Currently hovered point information */
  hoveredPoint: PropTypes.shape({
    cluster: PropTypes.number.isRequired,
    index: PropTypes.number.isRequired,
    x: PropTypes.number,
    y: PropTypes.number,
  }),
  /** Spike preview data from API */
  spikePreview: PropTypes.shape({
    waveform: PropTypes.arrayOf(PropTypes.number),
    channelId: PropTypes.number,
    spikeTime: PropTypes.number,
    filterType: PropTypes.string,
  }),
  /** Loading state */
  isLoading: PropTypes.bool,
  /** Callback when navigate button is clicked */
  onNavigateToSpike: PropTypes.func,
  /** Custom styles */
  style: PropTypes.object,
};

SpikePreviewPanel.defaultProps = {
  hoveredPoint: null,
  spikePreview: null,
  isLoading: false,
  onNavigateToSpike: null,
  style: {},
};

export default SpikePreviewPanel;
