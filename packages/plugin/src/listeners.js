// Automatic re-layout. Runs on the model's BEFORE_UNDO event, i.e. at the end of the
// outermost transaction but before the edit is handed to the undo manager. Changes made
// here are appended to the same edit, so a command (or a manual edit, or typing a label)
// and the layout it triggers are one undo step. mxLayoutManager uses the same mechanism.
import { applyLayout } from './apply-layout.js';
import { log } from './log.js';
import { isMindmapEdgeStyle, isTopicStyle } from './model.js';

/* global mxEvent, mxRootChange, mxChildChange, mxStyleChange */

const isMindmapStyle = (style) => isTopicStyle(style) || isMindmapEdgeStyle(style);

/**
 * Whether an edit touches a mindmap. Root changes (opening a file, switching pages)
 * never trigger a layout, so viewing a diagram doesn't modify it.
 */
export function isRelevantEdit(changes) {
  let relevant = false;
  for (const change of changes) {
    if (change instanceof mxRootChange) return false;
    if (relevant) continue;
    const cell = change instanceof mxChildChange ? change.child : change.cell;
    if (cell == null) continue;
    if (isMindmapStyle(cell.style)) relevant = true;
    else if (change instanceof mxStyleChange && isMindmapStyle(change.previous)) relevant = true;
  }
  return relevant;
}

export function registerListeners(ui, { stats } = {}) {
  const graph = ui.editor.graph;
  const model = graph.getModel();
  let running = false;

  model.addListener(mxEvent.BEFORE_UNDO, (sender, evt) => {
    if (running) return;
    const edit = evt.getProperty('edit');
    if (edit == null || !isRelevantEdit(edit.changes)) return;
    running = true;
    const start = performance.now();
    try {
      const changed = applyLayout(graph);
      if (stats != null) {
        stats.lastLayoutMs = performance.now() - start;
        stats.lastLayoutChanges = changed;
        stats.layoutRuns = (stats.layoutRuns ?? 0) + 1;
      }
    } catch (e) {
      log.error('layout failed', e);
    } finally {
      running = false;
    }
  });
}
