// Plugin entry point. draw.io calls the function passed to Draw.loadPlugin with the EditorUi.
import { createCommands } from './commands.js';
import { registerKeys, selectAndEdit } from './keys.js';
import { log } from './log.js';
import { registerActions, registerMenus } from './menu.js';
import { checkWebSocket } from './spike/ws-check.js';

/* global Draw, urlParams, __VERSION__, __DEV__ */

const VERSION = __VERSION__;

Draw.loadPlugin(function (ui) {
  const graph = ui.editor.graph;
  const debug = {};
  const commands = createCommands(graph);

  const newMindmap = () => selectAndEdit(graph, commands.createMindmap());

  registerActions(ui, { version: VERSION, debug, newMindmap });
  registerMenus(ui);
  registerKeys(ui, commands, { newMindmap });

  // Public API: selection-independent commands, one undo step each.
  // `spike` is the M0 WebSocket check, kept for e2e tests; removed in M6.
  const publicCommands = { ...commands };
  delete publicCommands.isTopic; // takes a cell, not an id: internal only
  window.mindmap = { version: VERSION, ...publicCommands, spike: { checkWebSocket } };

  // Internals for the console and e2e tests: dev builds, or any build with ?mindmapDebug=1.
  if (__DEV__ || (typeof urlParams !== 'undefined' && urlParams.mindmapDebug === '1')) {
    window.mindmapDebug = Object.assign(debug, { ui, graph, commands });
  }

  log.info(`loaded v${VERSION}${__DEV__ ? ' (dev build)' : ''}`);
});
