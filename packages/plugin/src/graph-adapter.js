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
    cells.push({
      id: cell.id,
      vertex,
      edge,
      style: model.getStyle(cell) ?? '',
      label: vertex ? labelOf(graph, cell) : '',
      source: edge ? (model.getTerminal(cell, true)?.id ?? null) : null,
      target: edge ? (model.getTerminal(cell, false)?.id ?? null) : null,
      geometry: geo ? { x: geo.x, y: geo.y, width: geo.width, height: geo.height } : null,
    });
  }
  return cells;
}
