/**
 * Widgets Module Entry Point
 * 
 * This module provides the widget system for the Spike Dashboard.
 * Use this to register and manage widgets.
 * 
 * @module widgets
 * 
 * @example
 * // Import the widget system
 * import { 
 *   registerWidget, 
 *   getWidget, 
 *   getAllWidgets,
 *   initializeBuiltinWidgets 
 * } from './widgets';
 * 
 * // Initialize built-in widgets at app startup
 * initializeBuiltinWidgets();
 * 
 * // Register a custom widget
 * registerWidget({
 *   id: 'myCustomWidget',
 *   name: 'My Widget',
 *   description: 'Does something cool',
 *   icon: '🎨',
 *   category: 'custom',
 *   defaultSize: { width: 400, height: 300 },
 *   component: MyWidgetComponent,
 * });
 */

// Export registry functions
export {
  WIDGET_CATEGORIES,
  registerWidget,
  unregisterWidget,
  getWidget,
  getAllWidgets,
  getWidgetsByCategory,
  getWidgetDefinitions,
  getDefaultWidgetStates,
  widgetRequiresData,
  getWidgetComponent,
  renderWidget,
  widgetRegistry,
} from './registry';

// Export built-in widget utilities
export {
  initializeBuiltinWidgets,
  getBuiltinWidgetIds,
  BUILTIN_WIDGETS,
} from './builtinWidgets';

// Export base widget component
export { default as BaseWidget, LoadingIndicator, ErrorIndicator, EmptyState } from './BaseWidget';

// Export example widget for reference
export { default as ExampleWidget, WIDGET_METADATA as EXAMPLE_WIDGET_METADATA } from './examples/ExampleWidget';
