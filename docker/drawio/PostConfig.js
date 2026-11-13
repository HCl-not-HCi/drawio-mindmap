/**
 * Copyright (c) 2006-2024, JGraph Holdings Ltd
 * Copyright (c) 2006-2024, draw.io AG
 */
// null'ing of global vars need to be after init.js
window.ICONSEARCH_PATH = null;
window.ICON_SERVICE_PATH = null;

// --- drawio-mindmap ---------------------------------------------------------
// Everything above is the unchanged PostConfig.js from jgraph/drawio:32.6.10.
// Registers the plugin under the id "mindmap", so it loads with
// http://localhost:8080/?p=mindmap and counts as a built-in plugin (no
// ALLOW_CUSTOM_PLUGINS needed). Re-copy the original part when bumping the
// image version. See docs/decisions.md (D2).
if (typeof App !== 'undefined' && App.pluginRegistry != null) {
  App.pluginRegistry.mindmap = 'plugins/custom/mindmap.js';
}
