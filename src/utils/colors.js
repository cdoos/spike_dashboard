/**
 * Color utilities for Spike Dashboard
 * 
 * Provides consistent color generation and management across components.
 */

/**
 * Default color palette for clusters
 */
export const CLUSTER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFD700', '#9B59B6', '#2ECC71',
  '#3498DB', '#E74C3C', '#1ABC9C', '#F39C12', '#8E44AD',
  '#16A085', '#27AE60', '#2980B9', '#8E44AD', '#F1C40F',
  '#E67E22', '#95A5A6', '#D35400', '#C0392B', '#7F8C8D',
];

/**
 * Generate a consistent HSL color for a cluster ID
 * Uses golden ratio for optimal color distribution
 * 
 * @param {number} clusterId - The cluster ID
 * @param {number} saturation - Saturation percentage (default: 70)
 * @param {number} lightness - Lightness percentage (default: 60)
 * @returns {string} HSL color string
 */
export function getClusterColor(clusterId, saturation = 70, lightness = 60) {
  const hue = (clusterId * 137.508) % 360; // Golden angle approximation
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get a color from the predefined palette
 * Falls back to generated color if index exceeds palette size
 * 
 * @param {number} index - Color index
 * @returns {string} Color value
 */
export function getPaletteColor(index) {
  if (index < CLUSTER_COLORS.length) {
    return CLUSTER_COLORS[index];
  }
  return getClusterColor(index);
}

/**
 * Convert hex color to RGBA
 * 
 * @param {string} hex - Hex color string
 * @param {number} alpha - Alpha value (0-1)
 * @returns {string} RGBA color string
 */
export function hexToRgba(hex, alpha = 1) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Generate a lighter/darker shade of a color
 * 
 * @param {string} hslColor - HSL color string
 * @param {number} amount - Amount to adjust lightness (-100 to 100)
 * @returns {string} Adjusted HSL color
 */
export function adjustLightness(hslColor, amount) {
  const match = hslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return hslColor;
  
  const h = parseInt(match[1]);
  const s = parseInt(match[2]);
  const l = Math.max(0, Math.min(100, parseInt(match[3]) + amount));
  
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * Get contrasting text color (black or white) for a background
 * 
 * @param {string} backgroundColor - Background color (hex)
 * @returns {string} '#000000' or '#ffffff'
 */
export function getContrastingTextColor(backgroundColor) {
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Theme colors for the dashboard
 */
export const THEME_COLORS = {
  primary: '#40e0d0',
  primaryDark: '#0d9488',
  secondary: '#6b7280',
  background: '#1a1a2e',
  backgroundLight: '#16213e',
  text: '#e0e6ed',
  textMuted: 'rgba(224, 230, 237, 0.7)',
  border: 'rgba(64, 224, 208, 0.3)',
  error: '#ff6b6b',
  warning: '#f39c12',
  success: '#2ecc71',
};

/**
 * Signal type colors
 */
export const SIGNAL_COLORS = {
  raw: '#4ECDC4',
  filtered: '#FFD700',
  spikes: '#FF6B6B',
};

export default {
  CLUSTER_COLORS,
  THEME_COLORS,
  SIGNAL_COLORS,
  getClusterColor,
  getPaletteColor,
  hexToRgba,
  adjustLightness,
  getContrastingTextColor,
};
