// Plugin entry point. draw.io calls the function passed to Draw.loadPlugin with the EditorUi.
import { createBridge } from './bridge.js';
import { createStatusIndicator, registerBridgeActions } from './bridge-ui.js';
import { createCommands } from './commands.js';
import { registerKeys, selectAndEdit } from './keys.js';
import { registerListeners } from './listeners.js';
import { log } from './log.js';
import { registerActions, registerMenus } from './menu.js';
import { registerPasteOutline } from './paste.js';

/* global Draw, urlParams, __VERSION__, __DEV__ */

const VERSION = __VERSION__;

Draw.loadPlugin(function (ui) {
  const graph = ui.editor.graph;
  const debug = {};
  const commands = createCommands(graph);

  const newMindmap = () => selectAndEdit(graph, commands.createMindmap());

  registerActions(ui, { version: VERSION, debug, newMindmap, commands });
  registerMenus(ui);
  registerKeys(ui, commands, { newMindmap });
  registerListeners(ui, { stats: debug, commands });
  registerPasteOutline(ui, commands);

  // Public API: selection-independent commands, one undo step each.
  const publicCommands = { ...commands };
  delete publicCommands.isTopic; // takes a cell, not an id: internal only
  window.mindmap = { version: VERSION, ...publicCommands };

  // Live LLM control: off until the user turns it on (decisions D22).
  let indicator = null;
  const bridge = createBridge({ ui, commands, onStatus: (s) => indicator?.update(s) });
  registerBridgeActions(ui, bridge);
  indicator = createStatusIndicator(ui, bridge);
  ui.editor.addListener('fileLoaded', () => bridge.updateTitle());

  // Internals for the console and e2e tests: dev builds, or any build with ?mindmapDebug=1.
  if (__DEV__ || (typeof urlParams !== 'undefined' && urlParams.mindmapDebug === '1')) {
    window.mindmapDebug = Object.assign(debug, { ui, graph, commands, bridge });
  }

  log.info(`loaded v${VERSION}${__DEV__ ? ' (dev build)' : ''}`);
});
