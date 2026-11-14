// Paste outline: plain text pasted while a single topic is selected (and no label is being
// edited) becomes child topics, one per line, nested by indentation or Markdown lists.
// draw.io's own clipboard content (copied cells) is never intercepted.
import { log } from './log.js';
import { parseMarkdown } from './io/markdown.js';

const DRAWIO_DATA = /mxGraphModel|mxfile|data-drawio/;

/** Whether pasted clipboard data is draw.io's own (copied cells). */
export function isDrawioClipboard(data) {
  return Object.values(data).some((value) => DRAWIO_DATA.test(value ?? ''));
}

export function registerPasteOutline(ui, commands) {
  const graph = ui.editor.graph;

  const onPaste = (evt) => {
    if (!graph.isEnabled() || graph.isEditing() || evt.clipboardData == null) return;
    const selected = commands.getSelectedTopics();
    if (selected.length !== 1 || graph.getSelectionCount() !== 1) return;

    const data = {};
    for (const type of evt.clipboardData.types) data[type] = evt.clipboardData.getData(type);
    const text = data['text/plain'];
    if (!text || text.trim() === '' || isDrawioClipboard(data)) return;

    evt.preventDefault();
    evt.stopImmediatePropagation();
    try {
      const forest = parseMarkdown(text);
      const model = graph.getModel();
      let first = null;
      model.beginUpdate();
      try {
        for (const n of forest) {
          const id = commands.importOutline(n, { parentId: selected[0] });
          first ??= id;
        }
      } finally {
        model.endUpdate();
      }
      if (first != null) commands.selectTopic(first);
    } catch (e) {
      log.error('paste failed', e);
      ui.handleError(e);
    }
  };

  // Capture phase on window, so this runs before draw.io's own paste handling.
  window.addEventListener('paste', onPaste, true);
}
