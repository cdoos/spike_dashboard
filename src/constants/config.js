/**
 * Application Constants and Configuration
 * 
 * Centralized location for all configuration values and constants
 * used throughout the Spike Dashboard application.
 */

// =====================
// Channel Configuration
// =====================

/** Default channels to display on initial load */
export const DEFAULT_CHANNELS = [179, 181, 183];

/** Total number of channels in a standard Neuropixels probe */
export const TOTAL_CHANNELS = 385;

/** Maximum number of channels that can be displayed at once */
export const MAX_DISPLAY_CHANNELS = 10;

// =====================
// Time Configuration
// =====================

/** Default time range for visualization (in samples) */
export const DEFAULT_TIME_RANGE = { start: 0, end: 1000 };

/** Default window size for visualization (in samples) */
export const DEFAULT_WINDOW_SIZE = 1000;

/** Maximum number of data points to request per API call */
export const MAX_DATA_POINTS = 20000;

/** Sampling rate in Hz */
export const SAMPLING_RATE = 30000;

/** Milliseconds per sample (1000 / SAMPLING_RATE) */
export const MS_PER_SAMPLE = 1000 / SAMPLING_RATE;

// =====================
// Spike Detection
// =====================

/** Default spike threshold value */
export const DEFAULT_SPIKE_THRESHOLD = -25;

/** Window size (samples) around spike for waveform extraction */
export const SPIKE_WAVEFORM_WINDOW = 30;

/** Preview window size (samples) for spike hover */
export const SPIKE_PREVIEW_WINDOW = 10;

// =====================
// Visualization
// =====================

/** Default filter type for signal processing */
export const DEFAULT_FILTER_TYPE = 'highpass';

/** Available filter types */
export const FILTER_TYPES = {
  NONE: 'none',
  HIGHPASS: 'highpass',
  LOWPASS: 'lowpass',
  BANDPASS: 'bandpass',
};

/** Default data display type */
export const DEFAULT_DATA_TYPE = 'raw';

/** Available data types */
export const DATA_TYPES = {
  RAW: 'raw',
  FILTERED: 'filtered',
  SPIKES: 'spikes',
};

/** Default view mode */
export const DEFAULT_VIEW = 'multipanel';

/** Available view modes */
export const VIEWS = {
  SIGNAL: 'signal',
  CLUSTERS: 'clusters',
  MULTIPANEL: 'multipanel',
  RUNTIME: 'runtime',
};

/** Default color for filtered data line */
export const FILTERED_LINE_COLOR = '#FFD700';

// =====================
// Cache Configuration
// =====================

/** Maximum number of items in the data cache */
export const CACHE_SIZE = 50;

/** Data fetch debounce delay (ms) */
export const FETCH_DEBOUNCE_MS = 200;

// =====================
// Dataset Configuration
// =====================

/** Default dataset filename */
export const DEFAULT_DATASET = 'c46_data_5percent.pt';

/** Allowed file extensions for upload */
export const ALLOWED_EXTENSIONS = ['bin', 'dat', 'raw', 'pt', 'npy'];

// =====================
// Algorithm Parameters
// =====================

/** Default parameters for JimsAlgorithm */
export const DEFAULT_JIMS_PARAMETERS = {
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
  pad_value: 0,
};

/** Default parameters for Kilosort4 */
export const DEFAULT_KILOSORT_PARAMETERS = {
  sampling_rate: SAMPLING_RATE,
  probe_path: 'torchbci/data/NeuroPix1_default.mat',
};

// =====================
// Clustering
// =====================

/** Maximum number of waveforms to request per cluster */
export const MAX_WAVEFORMS_PER_CLUSTER = 100;

/** Window size for waveform extraction in clustering */
export const CLUSTER_WAVEFORM_WINDOW = 30;

// =====================
// UI Configuration
// =====================

/** Color palette for clusters (used when color is not provided) */
export const CLUSTER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFD700', '#9B59B6', '#2ECC71',
  '#3498DB', '#E74C3C', '#1ABC9C', '#F39C12', '#8E44AD',
];

/** Minimum width for resizable panels */
export const MIN_PANEL_WIDTH = 200;

/** Default panel widths */
export const DEFAULT_PANEL_WIDTHS = {
  sidebar: 250,
  clusterList: 200,
  spikeList: 200,
};
