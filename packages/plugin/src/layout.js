// Two-sided mindmap layout. Pure functions on plain objects, no draw.io dependency.
//
// Input tree:  { id, width, height, side?, collapsed?, children: [...] }
//   `side` ('left' | 'right') is only read on first-level topics; `collapsed` hides children.
// Output:      { positions: Map<id, {x, y}>, sides: Map<id, 'left'|'right'> }
//   positions are top-left corners relative to the root's top-left corner at (0, 0).
//
// Each subtree is a block: children stacked vertically (with vGap between subtrees), the
// parent vertically centred on that block, and every child placed hGap away from its
// parent's outer edge. Blocks of different subtrees never overlap. The left side is the
// mirror image of the right side.

export const DEFAULT_SPACING = {
  rootGap: 60, // horizontal gap between the root and first-level topics
  hGap: 40, // horizontal gap between a topic and its children
  vGap: 12, // vertical gap between sibling subtrees
};

export const LEFT = 'left';
export const RIGHT = 'right';

const visibleChildren = (node) => (node.collapsed ? [] : (node.children ?? []));

/** Height of every subtree block, keyed by node id. */
export function measure(root, spacing = DEFAULT_SPACING) {
  const heights = new Map();
  const visit = (node) => {
    const children = visibleChildren(node);
    let block = 0;
    for (const child of children) block += visit(child);
    block += spacing.vGap * Math.max(0, children.length - 1);
    const h = Math.max(node.height, block);
    heights.set(node.id, h);
    return h;
  };
  visit(root);
  return heights;
}

/**
 * Splits first-level topics into sides. Explicit `side` values are kept; the others go,
 * in order, to whichever side is currently shorter (ties go right).
 */
export function assignSides(root, heights, spacing = DEFAULT_SPACING) {
  const sides = new Map();
  const total = { [LEFT]: 0, [RIGHT]: 0 };
  const add = (side, child) => {
    total[side] += (total[side] > 0 ? spacing.vGap : 0) + heights.get(child.id);
  };
  const children = visibleChildren(root);
  for (const child of children) {
    if (child.side === LEFT || child.side === RIGHT) {
      sides.set(child.id, child.side);
      add(child.side, child);
    }
  }
  for (const child of children) {
    if (sides.has(child.id)) continue;
    const side = total[LEFT] < total[RIGHT] ? LEFT : RIGHT;
    sides.set(child.id, side);
    add(side, child);
  }
  return sides;
}

/** Side for a new first-level topic: the currently shorter one (ties go right). */
export function chooseSide(root, spacing = DEFAULT_SPACING) {
  const heights = measure(root, spacing);
  const sides = assignSides(root, heights, spacing);
  const total = { [LEFT]: 0, [RIGHT]: 0 };
  for (const child of visibleChildren(root)) total[sides.get(child.id)] += heights.get(child.id);
  return total[LEFT] < total[RIGHT] ? LEFT : RIGHT;
}

export function layoutTree(root, spacing = DEFAULT_SPACING) {
  const heights = measure(root, spacing);
  const sides = assignSides(root, heights, spacing);
  const positions = new Map([[root.id, { x: 0, y: 0 }]]);

  // Places `node`'s subtree block with its top at `top`; `x` is the node's own left edge.
  const place = (node, x, top, dir) => {
    const h = heights.get(node.id);
    positions.set(node.id, { x, y: top + h / 2 - node.height / 2 });
    const children = visibleChildren(node);
    if (children.length === 0) return;
    stack(children, top + h / 2, dir === 1 ? x + node.width : x, spacing.hGap, dir);
  };

  // Stacks `nodes` vertically centred on `centerY`, `gap` away from the edge at `edgeX`.
  const stack = (nodes, centerY, edgeX, gap, dir) => {
    let block = spacing.vGap * (nodes.length - 1);
    for (const n of nodes) block += heights.get(n.id);
    let top = centerY - block / 2;
    for (const n of nodes) {
      const x = dir === 1 ? edgeX + gap : edgeX - gap - n.width;
      place(n, x, top, dir);
      top += heights.get(n.id) + spacing.vGap;
    }
  };

  const children = visibleChildren(root);
  const right = children.filter((c) => sides.get(c.id) === RIGHT);
  const left = children.filter((c) => sides.get(c.id) === LEFT);
  const centerY = root.height / 2;
  if (right.length > 0) stack(right, centerY, root.width, spacing.rootGap, 1);
  if (left.length > 0) stack(left, centerY, 0, spacing.rootGap, -1);

  return { positions, sides };
}
