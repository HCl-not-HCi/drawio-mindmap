// Keyboard shortcuts. They only apply when every selected cell is a mindmap topic and no
// label is being edited; otherwise draw.io's own handling runs unchanged.
import { log } from './log.js';

/* global mxEvent, mxClient */

export const KEY = { TAB: 9, ENTER: 13, BACKSPACE: 8, DELETE: 46, M: 77 };

export const NEW_MINDMAP_SHORTCUT = { keyCode: KEY.M, alt: true, shift: true };

/** Selects the topic, scrolls it into view and starts editing its label. */
export function selectAndEdit(graph, id) {
  const cell = graph.getModel().getCell(id);
  graph.setSelectionCell(cell);
  graph.scrollCellToVisible(cell);
  graph.startEditingAtCell(cell);
}

const modifiers = (evt) => ({
  ctrl: mxEvent.isControlDown(evt) || (mxClient.IS_MAC && mxEvent.isMetaDown(evt)),
  alt: mxEvent.isAltDown(evt),
  shift: mxEvent.isShiftDown(evt),
});

/**
 * @param {object} ui draw.io EditorUi
 * @param {ReturnType<import('./commands.js').createCommands>} commands
 * @param {{newMindmap: () => void}} actions
 */
export function registerKeys(ui, commands, actions) {
  const graph = ui.editor.graph;

  const run = (fn) => () => {
    try {
      fn();
    } catch (e) {
      log.error(e);
      ui.handleError(e);
    }
  };

  function selectedTopicIds() {
    const cells = graph.getSelectionCells();
    if (cells.length === 0 || !cells.every((c) => commands.isTopic(c))) return null;
    return cells.map((c) => c.id);
  }

  function mindmapFunction(evt) {
    if (!graph.isEnabled()) return null;
    const mod = modifiers(evt);

    // Tab while editing a topic label: finish editing and add a child right away.
    if (graph.isEditing()) {
      const editing = graph.cellEditor.getEditingCell();
      if (evt.keyCode !== KEY.TAB || mod.ctrl || mod.alt || mod.shift) return null;
      if (!commands.isTopic(editing)) return null;
      return run(() => {
        graph.stopEditing(false);
        selectAndEdit(graph, commands.addChild(editing.id));
      });
    }

    if (
      evt.keyCode === NEW_MINDMAP_SHORTCUT.keyCode &&
      mod.alt === NEW_MINDMAP_SHORTCUT.alt &&
      mod.shift === NEW_MINDMAP_SHORTCUT.shift &&
      !mod.ctrl
    ) {
      return run(actions.newMindmap);
    }
    if (mod.ctrl || mod.alt || mod.shift) return null;

    const ids = selectedTopicIds();
    if (ids == null) return null;

    switch (evt.keyCode) {
      case KEY.TAB:
        return ids.length === 1 ? run(() => selectAndEdit(graph, commands.addChild(ids[0]))) : null;
      case KEY.ENTER:
        return ids.length === 1
          ? run(() => selectAndEdit(graph, commands.addSibling(ids[0])))
          : null;
      case KEY.DELETE:
      case KEY.BACKSPACE:
        return run(() => {
          const { parentId } = commands.deleteTopics(ids);
          const parent = parentId != null ? graph.getModel().getCell(parentId) : null;
          if (parent != null) graph.setSelectionCell(parent);
        });
      default:
        return null;
    }
  }

  // Tab never reaches the key handler: EditorUi.onKeyDown handles and consumes it first
  // (focus/selection traversal). Hook in there too; consumed events are left alone.
  const onKeyDown = ui.onKeyDown;
  ui.onKeyDown = function (evt) {
    if (!mxEvent.isConsumed(evt)) {
      const fn = mindmapFunction(evt);
      if (fn != null) {
        fn();
        mxEvent.consume(evt);
        return;
      }
    }
    return onKeyDown.apply(this, arguments);
  };

  const keyHandler = ui.keyHandler;
  const getFunction = keyHandler.getFunction;
  keyHandler.getFunction = function (evt) {
    return (evt != null && mindmapFunction(evt)) || getFunction.apply(this, arguments);
  };

  // While editing a topic label, Enter finishes editing (Shift+Enter adds a line break).
  // A second Enter then adds a sibling, as in dedicated mindmap tools.
  const cellEditor = graph.cellEditor;
  const isStopEditingEvent = cellEditor.isStopEditingEvent;
  cellEditor.isStopEditingEvent = function (evt) {
    if (
      evt.keyCode === KEY.ENTER &&
      commands.isTopic(this.getEditingCell()) &&
      !mxEvent.isShiftDown(evt) &&
      !mxEvent.isAltDown(evt)
    ) {
      return true;
    }
    return isStopEditingEvent.apply(this, arguments);
  };
}
