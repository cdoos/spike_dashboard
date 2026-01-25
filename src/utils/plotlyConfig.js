/**
 * Plotly configuration utilities for Spike Dashboard
 * 
 * Provides consistent chart configurations across components.
 */

import { THEME_COLORS, getClusterColor } from './colors';

/**
 * Default dark theme layout for all Plotly charts
 */
export const DARK_THEME_LAYOUT = {
  paper_bgcolor: 'rgba(26, 26, 46, 0.9)',
  plot_bgcolor: 'rgba(26, 26, 46, 0.9)',
  font: {
    color: THEME_COLORS.text,
    family: 'Inter, system-ui, sans-serif',
  },
  margin: { l: 50, r: 20, t: 30, b: 40 },
};

/**
 * Default axis styling for dark theme
 */
export const DARK_THEME_AXIS = {
  gridcolor: 'rgba(64, 224, 208, 0.1)',
  zerolinecolor: 'rgba(64, 224, 208, 0.2)',
  tickfont: { color: THEME_COLORS.textMuted },
  titlefont: { color: THEME_COLORS.text },
};

/**
 * Default Plotly config options
 */
export const DEFAULT_CONFIG = {
  displayModeBar: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
  displaylogo: false,
  responsive: true,
};

/**
 * Minimal config for small charts/previews
 */
export const MINIMAL_CONFIG = {
  displayModeBar: false,
  displaylogo: false,
  responsive: true,
  staticPlot: false,
};

/**
 * Create a scatter plot layout for cluster visualization
 * 
 * @param {Object} options - Layout options
 * @param {string} options.title - Chart title
 * @param {string} options.xTitle - X-axis title
 * @param {string} options.yTitle - Y-axis title
 * @param {Object} options.xRange - X-axis range [min, max]
 * @param {Object} options.yRange - Y-axis range [min, max]
 * @returns {Object} Plotly layout object
 */
export function createScatterLayout({
  title = '',
  xTitle = 'PC1',
  yTitle = 'PC2',
  xRange = null,
  yRange = null,
  showLegend = true,
} = {}) {
  return {
    ...DARK_THEME_LAYOUT,
    title: title ? { text: title, font: { size: 14 } } : undefined,
    showlegend: showLegend,
    legend: {
      orientation: 'h',
      yanchor: 'bottom',
      y: 1.02,
      xanchor: 'right',
      x: 1,
      font: { size: 10 },
    },
    xaxis: {
      ...DARK_THEME_AXIS,
      title: xTitle,
      range: xRange,
    },
    yaxis: {
      ...DARK_THEME_AXIS,
      title: yTitle,
      range: yRange,
    },
    hovermode: 'closest',
  };
}

/**
 * Create a line chart layout for waveform visualization
 * 
 * @param {Object} options - Layout options
 * @returns {Object} Plotly layout object
 */
export function createWaveformLayout({
  title = '',
  xTitle = 'Time (ms)',
  yTitle = 'Amplitude',
  showLegend = false,
  height = 200,
} = {}) {
  return {
    ...DARK_THEME_LAYOUT,
    title: title ? { text: title, font: { size: 12 } } : undefined,
    height,
    showlegend: showLegend,
    xaxis: {
      ...DARK_THEME_AXIS,
      title: xTitle,
    },
    yaxis: {
      ...DARK_THEME_AXIS,
      title: yTitle,
    },
    hovermode: 'x unified',
  };
}

/**
 * Create a timeline layout for signal visualization
 * 
 * @param {Object} options - Layout options
 * @returns {Object} Plotly layout object
 */
export function createTimelineLayout({
  title = '',
  xTitle = 'Time (samples)',
  yTitle = 'Amplitude',
  xRange = null,
  dragmode = 'pan',
} = {}) {
  return {
    ...DARK_THEME_LAYOUT,
    title: title ? { text: title, font: { size: 12 } } : undefined,
    xaxis: {
      ...DARK_THEME_AXIS,
      title: xTitle,
      range: xRange,
    },
    yaxis: {
      ...DARK_THEME_AXIS,
      title: yTitle,
    },
    dragmode,
    hovermode: 'x unified',
  };
}

/**
 * Create a bar chart layout
 * 
 * @param {Object} options - Layout options
 * @returns {Object} Plotly layout object
 */
export function createBarLayout({
  title = '',
  xTitle = '',
  yTitle = '',
  barmode = 'group',
} = {}) {
  return {
    ...DARK_THEME_LAYOUT,
    title: title ? { text: title, font: { size: 14 } } : undefined,
    barmode,
    xaxis: {
      ...DARK_THEME_AXIS,
      title: xTitle,
    },
    yaxis: {
      ...DARK_THEME_AXIS,
      title: yTitle,
    },
  };
}

/**
 * Create scatter trace for cluster data
 * 
 * @param {Object} options - Trace options
 * @param {Array} options.x - X coordinates
 * @param {Array} options.y - Y coordinates
 * @param {number} options.clusterId - Cluster ID for color
 * @param {string} options.name - Trace name
 * @param {Array} options.customdata - Custom data for hover
 * @returns {Object} Plotly trace object
 */
export function createClusterTrace({
  x,
  y,
  clusterId,
  name = `Cluster ${clusterId}`,
  customdata = null,
  markerSize = 6,
  opacity = 0.7,
} = {}) {
  const color = getClusterColor(clusterId);
  
  return {
    type: 'scatter',
    mode: 'markers',
    x,
    y,
    name,
    customdata,
    marker: {
      size: markerSize,
      color,
      opacity,
      line: { width: 0.5, color: 'rgba(255,255,255,0.3)' },
    },
    hovertemplate: customdata
      ? '<b>%{customdata}</b><br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>'
      : '<b>%{fullData.name}</b><br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>',
  };
}

/**
 * Create line trace for waveform data
 * 
 * @param {Object} options - Trace options
 * @returns {Object} Plotly trace object
 */
export function createWaveformTrace({
  x,
  y,
  name = '',
  color = THEME_COLORS.primary,
  opacity = 0.5,
  lineWidth = 1,
} = {}) {
  return {
    type: 'scatter',
    mode: 'lines',
    x,
    y,
    name,
    line: {
      color,
      width: lineWidth,
    },
    opacity,
    hoverinfo: 'skip',
  };
}

/**
 * Create mean waveform trace (thicker, more prominent)
 * 
 * @param {Object} options - Trace options
 * @returns {Object} Plotly trace object
 */
export function createMeanWaveformTrace({
  x,
  y,
  name = 'Mean',
  color = '#ffffff',
} = {}) {
  return {
    type: 'scatter',
    mode: 'lines',
    x,
    y,
    name,
    line: {
      color,
      width: 2,
    },
    hovertemplate: '<b>Mean</b><br>Time: %{x:.2f}ms<br>Amplitude: %{y:.2f}<extra></extra>',
  };
}

export default {
  DARK_THEME_LAYOUT,
  DARK_THEME_AXIS,
  DEFAULT_CONFIG,
  MINIMAL_CONFIG,
  createScatterLayout,
  createWaveformLayout,
  createTimelineLayout,
  createBarLayout,
  createClusterTrace,
  createWaveformTrace,
  createMeanWaveformTrace,
};
