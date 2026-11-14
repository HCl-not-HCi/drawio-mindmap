// Applies layout.js to the draw.io model: fits topics to their labels, positions every
// topic of every mindmap on the page, persists first-level sides and normalises edge
// styles. Only cells whose geometry or style actually changes are touched, so undo
// history and file diffs stay small.
import { snapshot } from './graph-adapter.js';
import { DEFAULT_SPACING, layoutTree } from './layout.js';
import {
  buildIndex,
  getChildren,
  getLayoutOptions,
  getSide,
  isRootStyle,
  KEY_SIDE,
  toLayoutTree,
} from './model.js';
import { getStyleValue, setStyleValues } from './style.js';
import { EDGE_STYLE_VALUES, SIZING } from './styles.js';

const EPS = 0.5;
const differs = (a, b) => Math.abs(a - b) > EPS;

// Measuring a label renders it off-screen, which dominates layout time on large maps.
// Sizes only depend on style and label, so they are cached by both.
const sizeCache = new Map();
const SIZE_CACHE_LIMIT = 5000;

/** Topic size fitted to the label, within the role's min/max (see SIZING). Cached. */
export function fittedSize(graph, cell) {
  const model = graph.getModel();
  const key = `${model.getStyle(cell)}\u0000${graph.convertValueToString(cell)}`;
  if (sizeCache.has(key)) return sizeCache.get(key);
  const size = measureFittedSize(graph, cell);
  if (sizeCache.size >= SIZE_CACHE_LIMIT) sizeCache.clear();
  if (size != null) sizeCache.set(key, size);
  return size;
}

function measureFittedSize(graph, cell) {
  const rules = isRootStyle(graph.getModel().getStyle(cell)) ? SIZING.root : SIZING.topic;
  let pref = graph.getPreferredSizeForCell(cell);
  if (pref == null) return null;
  let width = pref.width + rules.padX;
  if (width > rules.maxWidth) {
    // Measure again with wrapping at the maximum text width.
    pref = graph.getPreferredSizeForCell(cell, rules.maxWidth - rules.padX);
    width = rules.maxWidth;
  }
  return {
    width: Math.round(Math.max(rules.minWidth, width)),
    height: Math.round(Math.max(rules.minHeight, pref.height + rules.padY)),
  };
}

/**
 * Lays out all mindmaps on the current page. Must run inside a model transaction
 * (it opens its own nested one). Returns the number of changed cells.
 */
export function applyLayout(graph, defaults = { mode: 'balanced', spacing: DEFAULT_SPACING }) {
  const model = graph.getModel();
  const index = buildIndex(snapshot(graph));
  let changed = 0;

  const setGeometry = (cell, x, y, width, height) => {
    const geo = model.getGeometry(cell);
    if (
      !differs(geo.x, x) &&
      !differs(geo.y, y) &&
      !differs(geo.width, width) &&
      !differs(geo.height, height)
    ) {
      return;
    }
    const next = geo.clone();
    next.x = x;
    next.y = y;
    next.width = width;
    next.height = height;
    model.setGeometry(cell, next);
    changed++;
  };

  const setStyle = (cell, values) => {
    const style = model.getStyle(cell);
    const next = setStyleValues(style, values);
    if (next !== style) {
      model.setStyle(cell, next);
      changed++;
    }
  };

  model.beginUpdate();
  try {
    const sizes = new Map();
    for (const [id, topic] of index.topics) {
      const size = fittedSize(graph, model.getCell(id));
      sizes.set(id, size ?? { width: topic.geometry.width, height: topic.geometry.height });
    }

    // draw.io tree folding: the +/- toggle only on topics that have children. A topic that
    // lost its last child while collapsed is expanded again.
    for (const id of index.topics.keys()) {
      const cell = model.getCell(id);
      const hasChildren = getChildren(index, id).length > 0;
      setStyle(cell, { treeFolding: hasChildren ? 1 : null });
      if (!hasChildren && model.isCollapsed(cell)) {
        model.setCollapsed(cell, false);
        changed++;
      }
    }

    for (const rootId of index.roots) {
      const tree = toLayoutTree(index, rootId, (id) => sizes.get(id));
      const { mode, spacing } = getLayoutOptions(index.topics.get(rootId).style, defaults);
      const { positions, sides } = layoutTree(tree, spacing, mode);
      const rootGeo = index.topics.get(rootId).geometry;
      for (const [id, pos] of positions) {
        const { width, height } = sizes.get(id);
        // The root is the anchor: it keeps its position (only its size may change).
        const x = id === rootId ? rootGeo.x : rootGeo.x + pos.x;
        const y = id === rootId ? rootGeo.y : rootGeo.y + pos.y;
        setGeometry(model.getCell(id), x, y, width, height);
      }
      // Persist sides only in balanced mode: one-sided modes must not overwrite them, so
      // switching back to balanced restores the previous arrangement.
      for (const [id, side] of mode === 'balanced' ? sides : []) {
        if (getSide(index.topics.get(id).style) !== side) {
          setStyle(model.getCell(id), { [KEY_SIDE]: side });
        }
      }
    }

    // Tree edges: curved connector style, no stale waypoints from manual edits.
    for (const { edgeId } of index.parentOf.values()) {
      const edge = model.getCell(edgeId);
      const style = model.getStyle(edge);
      const missing = Object.entries(EDGE_STYLE_VALUES).some(
        ([k, v]) => getStyleValue(style, k) !== String(v),
      );
      if (missing) setStyle(edge, EDGE_STYLE_VALUES);
      const geo = model.getGeometry(edge);
      if (geo?.points?.length > 0) {
        const next = geo.clone();
        next.points = null;
        model.setGeometry(edge, next);
        changed++;
      }
    }
  } finally {
    model.endUpdate();
  }
  return changed;
}
