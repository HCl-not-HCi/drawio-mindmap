// Mindmap data model on plain objects. No draw.io dependency.
//
// The diagram is read into a snapshot: an array of
//   { id, vertex, edge, style, label, source, target, collapsed, geometry: {x, y, width, height} }
// `collapsed` is draw.io's own folding state (treeFolding), see decisions D16.
// (see graph-adapter.js). This module derives the tree from it and plans changes;
// commands.js applies the plans to the draw.io model.
import { getStyleValue } from './style.js';

export const KEY_MINDMAP = 'mindmap';
export const KEY_ROLE = 'mmRole';
export const KEY_ORDER = 'mmOrder';
export const KEY_EDGE = 'mmEdge';
export const KEY_SIDE = 'mmSide';
// Per-map layout options, stored on the root topic (decisions D17).
export const KEY_LAYOUT = 'mmLayout';
export const KEY_ROOT_GAP = 'mmRootGap';
export const KEY_H_GAP = 'mmHGap';
export const KEY_V_GAP = 'mmVGap';
export const ROLE_ROOT = 'root';
export const ROLE_TOPIC = 'topic';

/** Gaps used to place new topics until the real layout exists (M2). */
export const PLACEMENT = { hGap: 60, vGap: 20 };

export const isTopicStyle = (style) => getStyleValue(style, KEY_MINDMAP) === '1';
export const isRootStyle = (style) =>
  isTopicStyle(style) && getStyleValue(style, KEY_ROLE) === ROLE_ROOT;
export const isMindmapEdgeStyle = (style) => getStyleValue(style, KEY_EDGE) === '1';

export function getOrder(style) {
  const n = Number.parseFloat(getStyleValue(style, KEY_ORDER));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Derives the mindmap forest from a snapshot.
 * Tree edges are edges with mmEdge=1 between two topics (parent = source, child = target).
 * Children are sorted by mmOrder, then by y, then by id, so hand-edited diagrams still work.
 */
export function buildIndex(cells) {
  const topics = new Map();
  for (const c of cells) if (c.vertex && isTopicStyle(c.style)) topics.set(c.id, c);

  const parentOf = new Map(); // childId -> { parentId, edgeId }
  const childrenOf = new Map(); // parentId -> [childId]
  for (const c of cells) {
    if (!c.edge || !isMindmapEdgeStyle(c.style)) continue;
    if (!topics.has(c.source) || !topics.has(c.target) || c.source === c.target) continue;
    if (parentOf.has(c.target)) continue; // second parent from a manual edit: ignore
    if (isRootStyle(topics.get(c.target).style)) continue; // roots have no parent
    parentOf.set(c.target, { parentId: c.source, edgeId: c.id });
    if (!childrenOf.has(c.source)) childrenOf.set(c.source, []);
    childrenOf.get(c.source).push(c.target);
  }

  const y = (id) => topics.get(id).geometry?.y ?? 0;
  for (const list of childrenOf.values()) {
    list.sort(
      (a, b) =>
        getOrder(topics.get(a).style) - getOrder(topics.get(b).style) ||
        y(a) - y(b) ||
        (a < b ? -1 : a > b ? 1 : 0),
    );
  }

  const roots = [...topics.values()].filter((t) => isRootStyle(t.style)).map((t) => t.id);
  return { topics, parentOf, childrenOf, roots };
}

export function requireTopic(index, id) {
  const topic = index.topics.get(id);
  if (topic == null) throw new Error(`Unknown topic: ${id}`);
  return topic;
}

export const getChildren = (index, id) => index.childrenOf.get(id) ?? [];
export const getParent = (index, id) => index.parentOf.get(id)?.parentId ?? null;

/** Walks up to the topmost ancestor (the root for a well-formed map). Cycle-safe. */
export function getRootOf(index, id) {
  requireTopic(index, id);
  const seen = new Set([id]);
  let current = id;
  for (let p = getParent(index, current); p != null; p = getParent(index, p)) {
    if (seen.has(p)) break;
    seen.add(p);
    current = p;
  }
  return current;
}

/** The topic and all its descendants, plus the tree edges inside and into the subtree. */
export function getSubtree(index, id) {
  requireTopic(index, id);
  const topicIds = [];
  const edgeIds = [];
  const incoming = index.parentOf.get(id);
  if (incoming) edgeIds.push(incoming.edgeId);
  const seen = new Set();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    topicIds.push(current);
    for (const child of getChildren(index, current)) {
      edgeIds.push(index.parentOf.get(child).edgeId);
      stack.push(child);
    }
  }
  return { topicIds, edgeIds };
}

function nextOrder(index, parentId) {
  let max = -1;
  for (const child of getChildren(index, parentId)) {
    const order = getOrder(index.topics.get(child).style);
    if (Number.isFinite(order)) max = Math.max(max, order);
  }
  return max + 1;
}

/** Bottom edge of the lowest topic in a subtree. */
function subtreeBottom(index, id) {
  let bottom = Number.NEGATIVE_INFINITY;
  for (const t of getSubtree(index, id).topicIds) {
    const g = index.topics.get(t).geometry;
    bottom = Math.max(bottom, g.y + g.height);
  }
  return bottom;
}

/**
 * Where and with which order a new last child of `parentId` goes.
 * @param {{width: number, height: number}} size of the new topic
 */
export function planAddChild(index, parentId, size) {
  const parent = requireTopic(index, parentId).geometry;
  const children = getChildren(index, parentId);
  const x = parent.x + parent.width + PLACEMENT.hGap;
  const y =
    children.length === 0
      ? parent.y + (parent.height - size.height) / 2
      : subtreeBottom(index, children.at(-1)) + PLACEMENT.vGap;
  return { parentId, order: nextOrder(index, parentId), position: { x, y } };
}

/**
 * A new topic directly after `topicId` among its siblings. On the root (or a topic
 * without parent) this adds a child instead.
 * Returns the new topic's order and the siblings whose mmOrder must change:
 * all siblings are renumbered 0..n so the order stays dense and explicit.
 */
export function planAddSibling(index, topicId, size) {
  const parentId = getParent(index, topicId);
  if (parentId == null) return { ...planAddChild(index, topicId, size), reorder: [] };

  const siblings = getChildren(index, parentId);
  const at = siblings.indexOf(topicId) + 1;
  const reorder = [];
  siblings.forEach((id, i) => {
    const order = i < at ? i : i + 1;
    if (getOrder(index.topics.get(id).style) !== order) reorder.push({ id, order });
  });

  const g = requireTopic(index, topicId).geometry;
  return {
    parentId,
    order: at,
    reorder,
    position: { x: g.x, y: subtreeBottom(index, topicId) + PLACEMENT.vGap },
  };
}

/**
 * Layout options of a map from its root style; missing or invalid values fall back to
 * `defaults` ({mode, spacing: {rootGap, hGap, vGap}}).
 */
export function getLayoutOptions(rootStyle, defaults) {
  const num = (key, fallback) => {
    const n = Number.parseFloat(getStyleValue(rootStyle, key));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const mode = getStyleValue(rootStyle, KEY_LAYOUT);
  return {
    mode: ['balanced', 'left', 'right'].includes(mode) ? mode : defaults.mode,
    spacing: {
      rootGap: num(KEY_ROOT_GAP, defaults.spacing.rootGap),
      hGap: num(KEY_H_GAP, defaults.spacing.hGap),
      vGap: num(KEY_V_GAP, defaults.spacing.vGap),
    },
  };
}

/** First-level ancestor of a topic (the topic itself on the first level), null for roots. */
export function getBranchTopic(index, id) {
  requireTopic(index, id);
  let current = id;
  const seen = new Set([id]);
  for (let p = getParent(index, current); p != null; p = getParent(index, p)) {
    if (getParent(index, p) == null) return current;
    if (seen.has(p)) return null;
    seen.add(p);
    current = p;
  }
  return null;
}

export function getSide(style) {
  const side = getStyleValue(style, KEY_SIDE);
  return side === 'left' || side === 'right' ? side : null;
}

/**
 * Input tree for layout.js: {id, width, height, side, collapsed, children}.
 * `sizeOf(id)` may override sizes (e.g. sizes fitted to labels); default: geometry.
 * `side` is only set on first-level topics.
 */
export function toLayoutTree(index, rootId, sizeOf) {
  const size = sizeOf ?? ((id) => index.topics.get(id).geometry);
  const build = (id, depth, seen) => {
    seen.add(id);
    const { style } = index.topics.get(id);
    const { width, height } = size(id);
    return {
      id,
      width,
      height,
      side: depth === 1 ? getSide(style) : null,
      collapsed: index.topics.get(id).collapsed === true,
      children: getChildren(index, id)
        .filter((c) => !seen.has(c))
        .map((c) => build(c, depth + 1, seen)),
    };
  };
  requireTopic(index, rootId);
  return build(rootId, 0, new Set());
}

/** Plain outline for display, tests and the LLM bridge: {id, label, children}. */
export function toOutline(index, id) {
  const build = (current, seen) => {
    seen.add(current);
    const topic = index.topics.get(current);
    return {
      id: current,
      label: topic.label ?? '',
      ...(topic.collapsed === true && { collapsed: true }),
      children: getChildren(index, current)
        .filter((c) => !seen.has(c))
        .map((c) => build(c, seen)),
    };
  };
  requireTopic(index, id);
  return build(id, new Set());
}
