// Reads the draw.io model into the plain snapshot that model.js works on.
// All direct reads of mxGraph cell internals live here.
import { htmlToText } from './text.js';

export function labelOf(graph, cell) {
  const value = graph.convertValueToString(cell) ?? '';
  return graph.isHtmlLabel(cell) ? htmlToText(value) : String(value);
}

/** All vertices and edges of the current page, as plain objects. */
export function snapshot(graph) {
  const model = graph.getModel();
  const cells = [];
  for (const cell of Object.values(model.cells ?? {})) {
    const vertex = model.isVertex(cell);
    const edge = model.isEdge(cell);
    if (!vertex && !edge) continue;
    const geo = model.getGeometry(cell);
    const entry = {
      id: cell.id,
      vertex,
      edge,
      style: model.getStyle(cell) ?? '',
      source: edge ? (model.getTerminal(cell, true)?.id ?? null) : null,
      target: edge ? (model.getTerminal(cell, false)?.id ?? null) : null,
      geometry: geo ? { x: geo.x, y: geo.y, width: geo.width, height: geo.height } : null,
    };
    // Converting HTML labels to text is the expensive part of a snapshot and only
    // outlines need it, so labels are computed on first access.
    let label;
    Object.defineProperty(entry, 'label', {
      enumerable: true,
      get: () => (label ??= vertex ? labelOf(graph, cell) : ''),
    });
    cells.push(entry);
  }
  return cells;
}
