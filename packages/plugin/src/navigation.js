// Arrow-key navigation between topics. Pure functions on the index from model.js.
//
// Left/Right follow the map's geometry: on the right side, Right goes to the children and
// Left to the parent; on the left side it's mirrored. From the root, Left/Right enter that
// side. Of several children, the one vertically closest to the current topic is chosen.
// Up/Down move between siblings (on the root's level: siblings on the same side).
import { getChildren, getParent, getSide, requireTopic } from './model.js';

export const DIRECTIONS = ['left', 'right', 'up', 'down'];

const centerY = (topic) => topic.geometry.y + topic.geometry.height / 2;
const isCollapsed = (topic) => topic.collapsed === true;

/** Side of a topic: its first-level ancestor's side; null for roots. Defaults to right. */
export function sideOf(index, id) {
  let current = id;
  let parent = getParent(index, current);
  if (parent == null) return null;
  const seen = new Set([current]);
  while (getParent(index, parent) != null && !seen.has(parent)) {
    seen.add(parent);
    current = parent;
    parent = getParent(index, current);
  }
  return getSide(index.topics.get(current).style) ?? 'right';
}

function closestTo(index, ids, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const id of ids) {
    const d = Math.abs(centerY(index.topics.get(id)) - y);
    if (d < bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * The topic to select when pressing an arrow key on `id`, or null to stay.
 * @param {'left'|'right'|'up'|'down'} direction
 */
export function navigate(index, id, direction) {
  const topic = requireTopic(index, id);
  const parent = getParent(index, id);
  const side = sideOf(index, id);
  const children = isCollapsed(topic) ? [] : getChildren(index, id);

  if (direction === 'left' || direction === 'right') {
    if (parent == null) {
      const onSide = children.filter((c) => (sideOf(index, c) ?? 'right') === direction);
      return closestTo(index, onSide, centerY(topic));
    }
    if (direction === side) return closestTo(index, children, centerY(topic));
    return parent;
  }

  if (parent == null) return null;
  const siblings = getChildren(index, parent).filter(
    (s) => getParent(index, parent) != null || sideOf(index, s) === side,
  );
  const at = siblings.indexOf(id);
  const next = direction === 'up' ? siblings[at - 1] : siblings[at + 1];
  return next ?? null;
}
