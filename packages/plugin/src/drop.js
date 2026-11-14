// What dropping a dragged topic means. Pure functions on the index from model.js.
//
// - Dropped onto another topic (its centre inside that topic): becomes its last child.
//   On a sibling, only the middle half counts; its top/bottom quarter reorders instead.
// - Dropped next to its siblings: moves between them, by vertical position. On the first
//   level this also picks the side: left or right of the root's centre.
// - Anywhere else: nothing (the layout puts it back).
import { getChildren, getParent, getSubtree, isRootStyle, requireTopic } from './model.js';
import { sideOf } from './navigation.js';

const center = (g) => ({ x: g.x + g.width / 2, y: g.y + g.height / 2 });
const contains = (g, p) =>
  p.x >= g.x && p.x <= g.x + g.width && p.y >= g.y && p.y <= g.y + g.height;

/**
 * @param {object} index from buildIndex (topics need `geometry`; hidden ones `visible: false`)
 * @param {string} topicId the dragged topic, with its geometry after the drag
 * @returns {null | {parentId: string, beforeId: string|null, side: 'left'|'right'|null}}
 */
export function planDrop(index, topicId) {
  const topic = requireTopic(index, topicId);
  const parentId = getParent(index, topicId);
  if (parentId == null && isRootStyle(topic.style)) return null; // roots stay where dropped
  const point = center(topic.geometry);
  const excluded = new Set(getSubtree(index, topicId).topicIds);

  // 1. Onto another topic.
  const siblingIds = new Set(parentId == null ? [] : getChildren(index, parentId));
  for (const [id, t] of index.topics) {
    if (excluded.has(id) || t.visible === false || t.geometry == null) continue;
    if (!contains(t.geometry, point)) continue;
    if (id === parentId) return null;
    const g = t.geometry;
    const inMiddle = point.y >= g.y + g.height / 4 && point.y <= g.y + (g.height * 3) / 4;
    if (!siblingIds.has(id) || inMiddle) return { parentId: id, beforeId: null, side: null };
    break; // edge of a sibling: reorder below
  }

  // A detached topic (pasted branch) can only be attached by dropping it onto a topic.
  if (parentId == null) return null;

  // 2. Among its siblings (same parent), on the root level per side.
  const parent = index.topics.get(parentId);
  const isRootLevel = getParent(index, parentId) == null;
  let side = null;
  let candidates = getChildren(index, parentId).filter((id) => id !== topicId);
  if (isRootLevel) {
    side = point.x < center(parent.geometry).x ? 'left' : 'right';
    candidates = candidates.filter((id) => sideOf(index, id) === side);
  }

  if (candidates.length > 0) {
    // Only when dropped roughly in the siblings' column.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const id of candidates) {
      const g = index.topics.get(id).geometry;
      minX = Math.min(minX, g.x);
      maxX = Math.max(maxX, g.x + g.width);
    }
    const slack = topic.geometry.width;
    if (point.x < minX - slack || point.x > maxX + slack) return null;
  } else if (!isRootLevel) {
    return null;
  }

  const before = candidates.find((id) => center(index.topics.get(id).geometry).y > point.y);
  const target = { parentId, beforeId: before ?? null, side };

  // Unchanged position: nothing to do.
  const siblings = getChildren(index, parentId);
  const at = siblings.indexOf(topicId);
  const sameSide = !isRootLevel || sideOf(index, topicId) === side;
  const nextOnSide = siblings
    .slice(at + 1)
    .find((id) => !isRootLevel || sideOf(index, id) === side);
  if (sameSide && (nextOnSide ?? null) === target.beforeId) return null;
  return target;
}
