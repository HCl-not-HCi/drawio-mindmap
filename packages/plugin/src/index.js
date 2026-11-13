// Plugin entry point. draw.io calls the function passed to Draw.loadPlugin with the EditorUi.
import { log } from './log.js';
import { registerActions, registerMenus } from './menu.js';
import { checkWebSocket } from './spike/ws-check.js';

/* global Draw, __VERSION__, __DEV__ */

const VERSION = __VERSION__;

Draw.loadPlugin(function (ui) {
  const debug = {};

  registerActions(ui, { version: VERSION, debug });
  registerMenus(ui);

  // Public API; M1 adds the topic commands here (window.mindmap.*).
  // `spike` is the M0 WebSocket check, kept public so e2e tests can call it; removed in M6.
  window.mindmap = { version: VERSION, spike: { checkWebSocket } };

  if (__DEV__) {
    window.mindmapDebug = Object.assign(debug, { ui, graph: ui.editor.graph });
  }

  log.info(`loaded v${VERSION}${__DEV__ ? ' (dev build)' : ''}`);
});
