# Widget Development Guide

This guide explains how to create custom widgets for the Spike Visualization Dashboard. Widgets are modular, reusable components that can display data, visualizations, or controls within the dashboard's multi-panel view.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Widget Architecture](#widget-architecture)
3. [Creating a Widget](#creating-a-widget)
4. [Widget Registration](#widget-registration)
5. [Available Props](#available-props)
6. [Using BaseWidget](#using-basewidget)
7. [API Integration](#api-integration)
8. [Styling Guidelines](#styling-guidelines)
9. [Best Practices](#best-practices)
10. [Examples](#examples)
11. [Troubleshooting](#troubleshooting)

---

## Quick Start

The fastest way to create a new widget:

### 1. Copy the Example Template

```bash
cp src/widgets/examples/ExampleWidget.js src/widgets/MyWidget.js
```

### 2. Modify the Widget

```jsx
// src/widgets/MyWidget.js
import React from 'react';
import PropTypes from 'prop-types';
import BaseWidget from './BaseWidget';

const MyWidget = ({ clusters, selectedClusters }) => {
  return (
    <BaseWidget
      title="My Custom Widget"
      isEmpty={!clusters || clusters.length === 0}
      emptyMessage="No data available"
    >
      {/* Your widget content here */}
      <div>
        <p>Total Clusters: {clusters?.length || 0}</p>
        <p>Selected: {selectedClusters?.length || 0}</p>
      </div>
    </BaseWidget>
  );
};

MyWidget.propTypes = {
  clusters: PropTypes.array,
  selectedClusters: PropTypes.array,
};

export const WIDGET_METADATA = {
  id: 'myWidget',
  name: 'My Widget',
  description: 'A custom widget',
  icon: '🎨',
  category: 'custom',
  defaultSize: { width: 300, height: 250 },
};

export default MyWidget;
```

### 3. Register the Widget

```jsx
// src/widgets/customWidgets.js
import { registerWidget } from './registry';
import MyWidget, { WIDGET_METADATA } from './MyWidget';

export function initializeCustomWidgets() {
  registerWidget({
    ...WIDGET_METADATA,
    component: MyWidget,
  });
}
```

### 4. Initialize at App Startup

```jsx
// src/App.js
import { initializeBuiltinWidgets } from './widgets';
import { initializeCustomWidgets } from './widgets/customWidgets';

// In your App component or index.js
initializeBuiltinWidgets();
initializeCustomWidgets();
```

---

## Widget Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    MultiPanelView                        │
│  ┌─────────────────────────────────────────────────────┐│
│  │                   Widget Bank                        ││
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐               ││
│  │  │ Widget1 │ │ Widget2 │ │ Widget3 │ ...           ││
│  │  └─────────┘ └─────────┘ └─────────┘               ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ DockableWidget  │  │ DockableWidget  │              │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │              │
│  │ │ YourWidget  │ │  │ │ YourWidget  │ │              │
│  │ └─────────────┘ │  │ └─────────────┘ │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| **Widget Registry** | Central store for widget definitions |
| **Widget Bank** | UI for browsing and adding widgets |
| **DockableWidget** | Container with dragging, resizing, minimize/maximize |
| **BaseWidget** | Optional wrapper providing common functionality |
| **Your Widget** | The actual widget component you create |

### Data Flow

```
App State (clusters, spikes, etc.)
         │
         ▼
   MultiPanelView
         │
         ├──► Widget Props
         │         │
         ▼         ▼
   DockableWidget ──► YourWidget
         │              │
         │              ▼
         │         BaseWidget (optional)
         │              │
         ▼              ▼
    UI Controls    Widget Content
```

---

## Creating a Widget

### File Structure

```
src/widgets/
├── registry.js          # Widget registration system
├── BaseWidget.js        # Base component
├── BaseWidget.css       # Base styles
├── builtinWidgets.js    # Built-in widget registration
├── index.js             # Module exports
├── examples/
│   └── ExampleWidget.js # Complete example
└── custom/              # Your custom widgets
    ├── MyWidget.js
    └── MyWidget.css
```

### Basic Widget Template

```jsx
import React from 'react';
import PropTypes from 'prop-types';

/**
 * MyWidget Component
 * 
 * Description of what your widget does.
 */
const MyWidget = ({
  // Data props from MultiPanelView
  clusters,
  selectedClusters,
  clusteringResults,
  selectedAlgorithm,
  
  // Callback props
  onClusterToggle,
  onSpikeSelect,
  
  // Configuration props (optional)
  maxItems = 100,
}) => {
  // Your widget logic here
  
  return (
    <div className="my-widget">
      {/* Widget content */}
    </div>
  );
};

MyWidget.propTypes = {
  clusters: PropTypes.array,
  selectedClusters: PropTypes.array,
  onClusterToggle: PropTypes.func,
};

// Widget metadata for registration
export const WIDGET_METADATA = {
  id: 'myWidget',          // Unique identifier
  name: 'My Widget',       // Display name
  description: 'Does X',   // Short description
  icon: '🎨',              // Emoji or icon
  category: 'custom',      // Category ID
  defaultSize: { width: 300, height: 250 },
  requiredData: ['clusters'], // Data dependencies
};

export default MyWidget;
```

---

## Widget Registration

### Registration Function

```jsx
import { registerWidget } from './widgets';

registerWidget({
  // Required fields
  id: 'myWidget',              // Unique string ID
  name: 'My Widget',           // Display name in Widget Bank
  description: 'Description',  // Shown in Widget Bank
  icon: '🎨',                  // Emoji or icon string
  category: 'custom',          // Category: 'data', 'analysis', 'visualization', 'custom'
  defaultSize: {               // Default dimensions
    width: 300,
    height: 250,
  },
  component: MyWidget,         // React component reference
  
  // Optional fields
  requiredData: ['clusters'],  // Data dependencies
  defaultProps: {},            // Default component props
  resizable: true,             // Allow resizing
  closable: true,              // Allow closing
  minWidth: 200,               // Minimum width
  minHeight: 150,              // Minimum height
  order: 10,                   // Default order in layout
});
```

### Widget Categories

| Category | ID | Description |
|----------|-----|-------------|
| Data Tables | `data` | Tables and lists of data |
| Analysis | `analysis` | Statistics and analysis tools |
| Visualization | `visualization` | Charts, plots, and graphs |
| Custom | `custom` | User-created widgets |

### Adding a New Category

```jsx
// In registry.js, add to WIDGET_CATEGORIES:
export const WIDGET_CATEGORIES = {
  // ... existing categories
  myCategory: {
    id: 'myCategory',
    name: 'My Category',
    icon: '🔧',
    description: 'Widgets for specific purpose',
  },
};
```

---

## Available Props

Widgets receive props from `MultiPanelView`. Here are the available props:

### Data Props

| Prop | Type | Description |
|------|------|-------------|
| `clusters` | `Array` | List of cluster objects with `clusterId`, `size`, etc. |
| `selectedClusters` | `Array<number>` | IDs of currently selected clusters |
| `spikes` | `Array` | List of spike objects with `time`, `clusterId` |
| `selectedSpike` | `number` | Index of selected spike |
| `clusterStats` | `Object` | Statistics keyed by cluster ID |
| `clusterData` | `Object` | Full cluster data from API |
| `clusterWaveforms` | `Object` | Waveform data keyed by cluster ID |
| `clusteringResults` | `Object` | Results from spike sorting algorithm |
| `selectedAlgorithm` | `string` | Current algorithm: `'torchbci_jims'`, `'kilosort4'`, `'preprocessed_torchbci'`, `'preprocessed_kilosort4'` |
| `signalData` | `Object` | Signal data for visualization |
| `timeRange` | `Object` | `{ start, end }` in samples |
| `highlightedSpikes` | `Array` | Spikes to highlight in visualizations |
| `datasetInfo` | `Object` | Info about current dataset |

### Callback Props

| Prop | Type | Description |
|------|------|-------------|
| `onClusterToggle(clusterId)` | `Function` | Toggle cluster selection |
| `onSpikeSelect(index, spike)` | `Function` | Select a spike |
| `onTimeRangeChange({ start, end })` | `Function` | Change time range |
| `onHighlightSpikes(spikes)` | `Function` | Highlight spikes |

### Example Usage

```jsx
const MyWidget = ({
  clusters,
  selectedClusters,
  onClusterToggle,
}) => {
  return (
    <div>
      {clusters.map(cluster => (
        <div 
          key={cluster.clusterId}
          onClick={() => onClusterToggle(cluster.clusterId)}
          className={selectedClusters.includes(cluster.clusterId) ? 'selected' : ''}
        >
          Cluster {cluster.clusterId}: {cluster.size} spikes
        </div>
      ))}
    </div>
  );
};
```

---

## Using BaseWidget

`BaseWidget` provides common widget functionality out of the box.

### Features

- Loading state with spinner
- Error state with retry button
- Empty state with custom message
- Auto-refresh capability
- Toolbar and footer support
- Consistent styling

### Basic Usage

```jsx
import BaseWidget from './BaseWidget';

const MyWidget = ({ data, isLoading, error }) => {
  return (
    <BaseWidget
      title="My Widget"
      isLoading={isLoading}
      error={error}
      isEmpty={!data || data.length === 0}
      emptyMessage="No items found"
    >
      {/* Your content */}
      {data.map(item => <div key={item.id}>{item.name}</div>)}
    </BaseWidget>
  );
};
```

### With Toolbar and Footer

```jsx
<BaseWidget
  title="Data Browser"
  toolbar={
    <div>
      <button onClick={handleSort}>Sort</button>
      <input placeholder="Search..." onChange={handleSearch} />
    </div>
  }
  footer={
    <span>Showing {data.length} items</span>
  }
>
  {/* Content */}
</BaseWidget>
```

### With Auto-Refresh

```jsx
<BaseWidget
  title="Live Data"
  onRefresh={fetchData}        // Called when refresh button clicked
  refreshInterval={5000}       // Auto-refresh every 5 seconds
>
  {/* Content */}
</BaseWidget>
```

### BaseWidget Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | - | Widget title |
| `isLoading` | `boolean` | `false` | Show loading state |
| `loadingMessage` | `string` | `'Loading...'` | Loading message |
| `error` | `string` | `null` | Error message (shows error state) |
| `onRetry` | `function` | - | Retry button callback |
| `isEmpty` | `boolean` | `false` | Show empty state |
| `emptyMessage` | `string` | `'No data available'` | Empty state message |
| `emptyIcon` | `string` | `'📭'` | Empty state icon |
| `toolbar` | `ReactNode` | - | Toolbar content |
| `footer` | `ReactNode` | - | Footer content |
| `onRefresh` | `function` | - | Refresh button callback |
| `refreshInterval` | `number` | - | Auto-refresh interval (ms) |

---

## API Integration

### Using the API Client

```jsx
import apiClient from '../api/client';

const MyWidget = ({ selectedClusters, selectedAlgorithm }) => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiClient.getClusterStatistics(
        selectedClusters,
        selectedAlgorithm
      );
      setData(result.statistics);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClusters.length > 0) {
      fetchData();
    }
  }, [selectedClusters, selectedAlgorithm]);

  return (
    <BaseWidget
      isLoading={isLoading}
      error={error}
      onRetry={fetchData}
    >
      {/* Render data */}
    </BaseWidget>
  );
};
```

### Available API Methods

```javascript
// Datasets
apiClient.getDatasets()
apiClient.setDataset(datasetName)

// Cluster Data
apiClient.getClusterData(mode, channelMapping)
apiClient.getClusterStatistics(clusterIds, algorithm)
apiClient.getClusterWaveforms({ clusterIds, maxWaveforms, algorithm })

// Spike Data
apiClient.getSpikeData({ channels, startTime, endTime, ... })
apiClient.getSpikePreview({ spikeTime, channelId, window, filterType })

// Algorithms
apiClient.getAlgorithms()
apiClient.runSpikeSorting(algorithm, parameters)
apiClient.getClusteringResults(algorithm)
```

---

## Styling Guidelines

### Color Palette

Use the theme colors from `utils/colors.js`:

```jsx
import { THEME_COLORS, getClusterColor } from '../utils/colors';

// Theme colors
THEME_COLORS.primary      // #40e0d0 - Turquoise
THEME_COLORS.primaryDark  // #0d9488
THEME_COLORS.background   // #1a1a2e
THEME_COLORS.text         // #e0e6ed
THEME_COLORS.textMuted    // rgba(224, 230, 237, 0.7)
THEME_COLORS.border       // rgba(64, 224, 208, 0.3)
THEME_COLORS.error        // #ff6b6b

// Cluster colors
getClusterColor(clusterId)  // Returns HSL color
```

### CSS Variables (Recommended)

```css
.my-widget {
  background: var(--widget-bg, rgba(26, 26, 46, 0.9));
  border: 1px solid var(--border-color, rgba(64, 224, 208, 0.3));
  color: var(--text-color, #e0e6ed);
}

.my-widget-header {
  color: var(--primary-color, #40e0d0);
}
```

### Styling Patterns

```css
/* Widget container */
.my-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 8px;
}

/* Interactive elements */
.my-widget-item {
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.my-widget-item:hover {
  background: rgba(64, 224, 208, 0.1);
}

.my-widget-item.selected {
  background: rgba(64, 224, 208, 0.2);
  border: 1px solid rgba(64, 224, 208, 0.4);
}

/* Buttons */
.my-widget-btn {
  padding: 6px 12px;
  background: rgba(64, 224, 208, 0.1);
  border: 1px solid rgba(64, 224, 208, 0.3);
  border-radius: 4px;
  color: #40e0d0;
  cursor: pointer;
}

.my-widget-btn:hover {
  background: rgba(64, 224, 208, 0.2);
}
```

---

## Best Practices

### 1. Handle All States

```jsx
const MyWidget = ({ data }) => {
  if (!data) return <LoadingIndicator />;
  if (data.error) return <ErrorIndicator error={data.error} />;
  if (data.items.length === 0) return <EmptyState />;
  
  return <DataView data={data} />;
};
```

### 2. Use Memoization

```jsx
import { useMemo, useCallback } from 'react';

const MyWidget = ({ clusters, selectedClusters }) => {
  // Memoize expensive computations
  const sortedClusters = useMemo(() => 
    [...clusters].sort((a, b) => b.size - a.size),
    [clusters]
  );
  
  // Memoize callbacks
  const handleSelect = useCallback((id) => {
    // ...
  }, [/* dependencies */]);
  
  return /* ... */;
};
```

### 3. Respond to Prop Changes

```jsx
useEffect(() => {
  // Re-fetch when dependencies change
  fetchData();
}, [selectedClusters, selectedAlgorithm]);

// Or use a key to reset component
<MyChildComponent key={selectedAlgorithm} />
```

### 4. Clean Up Resources

```jsx
useEffect(() => {
  const intervalId = setInterval(fetchData, 5000);
  
  return () => {
    clearInterval(intervalId);
  };
}, []);
```

### 5. Document Your Widget

```jsx
/**
 * MyWidget - Brief description
 * 
 * Detailed description of what the widget does,
 * what data it displays, and any special features.
 * 
 * @example
 * <MyWidget 
 *   clusters={clusters}
 *   onSelect={handleSelect}
 * />
 */
const MyWidget = ({ ... }) => { ... };

MyWidget.propTypes = {
  /** Array of cluster objects */
  clusters: PropTypes.array.isRequired,
  /** Callback when cluster is selected */
  onSelect: PropTypes.func,
};
```

---

## Examples

### Simple Counter Widget

```jsx
import React, { useMemo } from 'react';
import BaseWidget from '../BaseWidget';

const CounterWidget = ({ clusters, spikes }) => {
  const stats = useMemo(() => ({
    totalClusters: clusters?.length || 0,
    totalSpikes: spikes?.length || 0,
    avgSpikesPerCluster: clusters?.length 
      ? Math.round((spikes?.length || 0) / clusters.length) 
      : 0,
  }), [clusters, spikes]);

  return (
    <BaseWidget title="Quick Stats">
      <div className="counter-grid">
        <div className="stat-box">
          <span className="stat-value">{stats.totalClusters}</span>
          <span className="stat-label">Clusters</span>
        </div>
        <div className="stat-box">
          <span className="stat-value">{stats.totalSpikes}</span>
          <span className="stat-label">Spikes</span>
        </div>
        <div className="stat-box">
          <span className="stat-value">{stats.avgSpikesPerCluster}</span>
          <span className="stat-label">Avg/Cluster</span>
        </div>
      </div>
    </BaseWidget>
  );
};

export const WIDGET_METADATA = {
  id: 'counterWidget',
  name: 'Quick Stats',
  description: 'Shows summary statistics',
  icon: '📊',
  category: 'analysis',
  defaultSize: { width: 250, height: 200 },
};

export default CounterWidget;
```

### Interactive List Widget

```jsx
import React, { useState, useMemo } from 'react';
import BaseWidget from '../BaseWidget';
import { getClusterColor } from '../../utils/colors';

const ClusterBrowser = ({ 
  clusters, 
  selectedClusters, 
  onClusterToggle 
}) => {
  const [sortBy, setSortBy] = useState('size');
  const [filterText, setFilterText] = useState('');

  const filteredClusters = useMemo(() => {
    let result = clusters || [];
    
    // Filter
    if (filterText) {
      result = result.filter(c => 
        c.clusterId.toString().includes(filterText)
      );
    }
    
    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'size') return b.size - a.size;
      return a.clusterId - b.clusterId;
    });
    
    return result;
  }, [clusters, filterText, sortBy]);

  const toolbar = (
    <>
      <input 
        placeholder="Filter..."
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
      />
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
        <option value="size">Size</option>
        <option value="id">ID</option>
      </select>
    </>
  );

  return (
    <BaseWidget 
      title="Cluster Browser"
      toolbar={toolbar}
      isEmpty={!clusters?.length}
      emptyMessage="Run spike sorting to see clusters"
    >
      <div className="cluster-list">
        {filteredClusters.map(cluster => (
          <div 
            key={cluster.clusterId}
            className={`cluster-item ${
              selectedClusters?.includes(cluster.clusterId) ? 'selected' : ''
            }`}
            onClick={() => onClusterToggle?.(cluster.clusterId)}
          >
            <span 
              className="color-indicator"
              style={{ background: getClusterColor(cluster.clusterId) }}
            />
            <span className="cluster-id">#{cluster.clusterId}</span>
            <span className="cluster-size">{cluster.size} spikes</span>
          </div>
        ))}
      </div>
    </BaseWidget>
  );
};

export const WIDGET_METADATA = {
  id: 'clusterBrowser',
  name: 'Cluster Browser',
  description: 'Browse and filter clusters',
  icon: '🔍',
  category: 'data',
  defaultSize: { width: 280, height: 400 },
  requiredData: ['clusters'],
};

export default ClusterBrowser;
```

### Chart Widget with Plotly

```jsx
import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import BaseWidget from '../BaseWidget';
import { DARK_THEME_LAYOUT, DEFAULT_CONFIG } from '../../utils/plotlyConfig';
import { getClusterColor } from '../../utils/colors';

const ClusterSizeChart = ({ clusters }) => {
  const plotData = useMemo(() => {
    if (!clusters?.length) return [];
    
    return [{
      type: 'bar',
      x: clusters.map(c => `Cluster ${c.clusterId}`),
      y: clusters.map(c => c.size),
      marker: {
        color: clusters.map(c => getClusterColor(c.clusterId)),
      },
    }];
  }, [clusters]);

  const layout = {
    ...DARK_THEME_LAYOUT,
    xaxis: { title: 'Cluster' },
    yaxis: { title: 'Spike Count' },
    margin: { l: 50, r: 20, t: 20, b: 60 },
  };

  return (
    <BaseWidget 
      title="Cluster Sizes"
      isEmpty={!clusters?.length}
    >
      <Plot
        data={plotData}
        layout={layout}
        config={DEFAULT_CONFIG}
        style={{ width: '100%', height: '100%' }}
      />
    </BaseWidget>
  );
};

export const WIDGET_METADATA = {
  id: 'clusterSizeChart',
  name: 'Cluster Size Chart',
  description: 'Bar chart of cluster sizes',
  icon: '📊',
  category: 'visualization',
  defaultSize: { width: 450, height: 350 },
  requiredData: ['clusters'],
};

export default ClusterSizeChart;
```

---

## Troubleshooting

### Widget Not Appearing in Widget Bank

1. Check that the widget is registered:
   ```jsx
   import { getAllWidgets } from './widgets';
   console.log(getAllWidgets());
   ```

2. Ensure registration happens before render:
   ```jsx
   // In index.js or App.js, before ReactDOM.render
   initializeBuiltinWidgets();
   initializeCustomWidgets();
   ```

3. Verify required fields are present:
   - `id`, `name`, `description`, `icon`, `category`, `defaultSize`, `component`

### Widget Renders But Shows No Data

1. Check if required props are being passed:
   ```jsx
   console.log('Widget props:', { clusters, selectedClusters });
   ```

2. Verify data dependencies in `requiredData`:
   ```jsx
   requiredData: ['clusters', 'clusteringResults'],
   ```

3. Ensure the parent component passes the data:
   - Check `MultiPanelView.js` for prop passing

### Styling Issues

1. Widget styles not applying:
   - Ensure CSS is imported
   - Check for CSS class name conflicts
   - Use unique class prefixes

2. Widget overflowing container:
   - Set `height: 100%` on root element
   - Use `overflow: auto` for scrollable content

### Performance Issues

1. Re-renders too often:
   - Use `useMemo` for expensive computations
   - Use `useCallback` for event handlers
   - Check dependency arrays in hooks

2. Large data sets:
   - Implement virtualization for long lists
   - Paginate or limit displayed items
   - Debounce filter/search inputs

---

## Support

For questions or issues:

1. Check the example widgets in `src/widgets/examples/`
2. Review the built-in widgets in `src/components/`
3. Consult the API client at `src/api/client.js`

Happy widget building! 🎨
