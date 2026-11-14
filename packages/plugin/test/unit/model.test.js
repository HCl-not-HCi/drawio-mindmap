import { describe, expect, it } from 'vitest';
import {
  buildIndex,
  getRootOf,
  getSubtree,
  isRootStyle,
  isTopicStyle,
  planAddChild,
  planAddSibling,
  PLACEMENT,
  toLayoutTree,
  toOutline,
} from '../../src/model.js';

const SIZE = { width: 100, height: 30 };

// Tiny snapshot builder: topic(id, parent?, order?, geometry?)
function snapshot(defs) {
  const cells = [];
  for (const d of defs) {
    const role = d.parent ? 'topic' : 'root';
    const order = d.order != null ? `mmOrder=${d.order};` : '';
    cells.push({
      id: d.id,
      vertex: true,
      edge: false,
      label: d.label ?? d.id.toUpperCase(),
      style: `rounded=1;mindmap=1;mmRole=${role};${order}`,
      geometry: { x: 0, y: 0, width: 100, height: 30, ...d.geometry },
    });
    if (d.parent) {
      cells.push({
        id: `e-${d.id}`,
        vertex: false,
        edge: true,
        style: 'endArrow=none;mmEdge=1;',
        source: d.parent,
        target: d.id,
      });
    }
  }
  return cells;
}

describe('style predicates', () => {
  it('recognises topics and roots', () => {
    expect(isTopicStyle('mindmap=1;mmRole=topic')).toBe(true);
    expect(isTopicStyle('rounded=1')).toBe(false);
    expect(isRootStyle('mindmap=1;mmRole=root')).toBe(true);
    expect(isRootStyle('mmRole=root')).toBe(false);
  });
});

describe('buildIndex', () => {
  it('derives parents, children and roots from mmEdge edges', () => {
    const index = buildIndex(
      snapshot([{ id: 'r' }, { id: 'a', parent: 'r', order: 0 }, { id: 'b', parent: 'a' }]),
    );
    expect(index.roots).toEqual(['r']);
    expect(index.childrenOf.get('r')).toEqual(['a']);
    expect(index.parentOf.get('b')).toEqual({ parentId: 'a', edgeId: 'e-b' });
  });

  it('sorts children by mmOrder, then y, then id', () => {
    const index = buildIndex(
      snapshot([
        { id: 'r' },
        { id: 'c', parent: 'r', order: 2 },
        { id: 'a', parent: 'r', order: 0 },
        { id: 'y2', parent: 'r', geometry: { y: 50 } },
        { id: 'y1', parent: 'r', geometry: { y: 10 } },
        { id: 'b', parent: 'r', order: 1 },
      ]),
    );
    expect(index.childrenOf.get('r')).toEqual(['a', 'b', 'c', 'y1', 'y2']);
  });

  it('ignores non-mindmap edges, edges to non-topics and second parents', () => {
    const cells = snapshot([{ id: 'r' }, { id: 'a', parent: 'r' }, { id: 'b', parent: 'r' }]);
    cells.push(
      { id: 'plain', vertex: true, edge: false, style: 'rounded=1', geometry: {} },
      { id: 'x1', edge: true, style: 'endArrow=none', source: 'a', target: 'b' },
      { id: 'x2', edge: true, style: 'mmEdge=1', source: 'a', target: 'plain' },
      { id: 'x3', edge: true, style: 'mmEdge=1', source: 'a', target: 'b' },
      { id: 'x4', edge: true, style: 'mmEdge=1', source: 'a', target: 'r' },
    );
    const index = buildIndex(cells);
    expect(index.parentOf.get('b').parentId).toBe('r');
    expect(index.parentOf.has('r')).toBe(false);
    expect(index.topics.has('plain')).toBe(false);
  });
});

describe('tree queries', () => {
  const index = buildIndex(
    snapshot([
      { id: 'r' },
      { id: 'a', parent: 'r', order: 0 },
      { id: 'a1', parent: 'a', order: 0 },
      { id: 'b', parent: 'r', order: 1 },
    ]),
  );

  it('finds the root of any topic', () => {
    expect(getRootOf(index, 'a1')).toBe('r');
    expect(getRootOf(index, 'r')).toBe('r');
  });

  it('collects a subtree with its incoming and inner edges', () => {
    const sub = getSubtree(index, 'a');
    expect(sub.topicIds.sort()).toEqual(['a', 'a1']);
    expect(sub.edgeIds.sort()).toEqual(['e-a', 'e-a1']);
    expect(getSubtree(index, 'r').topicIds).toHaveLength(4);
  });

  it('builds an outline', () => {
    expect(toOutline(index, 'r')).toEqual({
      id: 'r',
      label: 'R',
      children: [
        { id: 'a', label: 'A', children: [{ id: 'a1', label: 'A1', children: [] }] },
        { id: 'b', label: 'B', children: [] },
      ],
    });
  });

  it('throws on unknown ids', () => {
    expect(() => getSubtree(index, 'nope')).toThrow('Unknown topic: nope');
  });

  it('survives cycles from manual edits', () => {
    const cells = snapshot([{ id: 'r' }, { id: 'a', parent: 'r' }, { id: 'b', parent: 'a' }]);
    // Re-point a's incoming edge so a and b form a cycle detached from the root.
    cells.find((c) => c.id === 'e-a').source = 'b';
    const cyc = buildIndex(cells);
    expect(['a', 'b']).toContain(getRootOf(cyc, 'a'));
    expect(getSubtree(cyc, 'a').topicIds.sort()).toEqual(['a', 'b']);
    expect(toOutline(cyc, 'a').children[0].children).toEqual([]);
  });
});

describe('planAddChild', () => {
  it('places the first child right of the parent, vertically centred', () => {
    const index = buildIndex(snapshot([{ id: 'r', geometry: { x: 100, y: 100, height: 60 } }]));
    expect(planAddChild(index, 'r', SIZE)).toEqual({
      parentId: 'r',
      order: 0,
      position: { x: 200 + PLACEMENT.hGap, y: 115 },
    });
  });

  it('appends below the last child subtree with the next order', () => {
    const index = buildIndex(
      snapshot([
        { id: 'r' },
        { id: 'a', parent: 'r', order: 0, geometry: { y: 0 } },
        { id: 'a1', parent: 'a', order: 0, geometry: { y: 100 } },
      ]),
    );
    const plan = planAddChild(index, 'r', SIZE);
    expect(plan.order).toBe(1);
    expect(plan.position.y).toBe(130 + PLACEMENT.vGap);
  });
});

describe('planAddSibling', () => {
  const index = buildIndex(
    snapshot([
      { id: 'r' },
      { id: 'a', parent: 'r', order: 0, geometry: { x: 200, y: 0 } },
      { id: 'b', parent: 'r', order: 1, geometry: { x: 200, y: 50 } },
      { id: 'c', parent: 'r', order: 2, geometry: { x: 200, y: 100 } },
    ]),
  );

  it('inserts after the topic and shifts later siblings', () => {
    const plan = planAddSibling(index, 'a', SIZE);
    expect(plan.parentId).toBe('r');
    expect(plan.order).toBe(1);
    expect(plan.reorder).toEqual([
      { id: 'b', order: 2 },
      { id: 'c', order: 3 },
    ]);
    expect(plan.position).toEqual({ x: 200, y: 30 + PLACEMENT.vGap });
  });

  it('needs no reorder after the last sibling', () => {
    expect(planAddSibling(index, 'c', SIZE)).toMatchObject({ order: 3, reorder: [] });
  });

  it('normalises missing orders', () => {
    const loose = buildIndex(
      snapshot([{ id: 'r' }, { id: 'a', parent: 'r' }, { id: 'b', parent: 'r', order: 5 }]),
    );
    // b (order 5) sorts before a (no order).
    const plan = planAddSibling(loose, 'b', SIZE);
    expect(plan.order).toBe(1);
    expect(plan.reorder).toEqual([
      { id: 'b', order: 0 },
      { id: 'a', order: 2 },
    ]);
  });

  it('adds a child when called on the root', () => {
    expect(planAddSibling(index, 'r', SIZE)).toMatchObject({ parentId: 'r', order: 3 });
  });
});

describe('toLayoutTree', () => {
  it('builds layout input with sides on first-level topics and collapsed flags', () => {
    const cells = snapshot([
      { id: 'r', geometry: { width: 160, height: 60 } },
      { id: 'a', parent: 'r', order: 0 },
      { id: 'a1', parent: 'a', order: 0 },
    ]);
    cells.find((c) => c.id === 'a').style += 'mmSide=left;';
    cells.find((c) => c.id === 'a').collapsed = true;
    cells.find((c) => c.id === 'a1').style += 'mmSide=right;';
    const tree = toLayoutTree(buildIndex(cells), 'r');
    expect(tree).toEqual({
      id: 'r',
      width: 160,
      height: 60,
      side: null,
      collapsed: false,
      children: [
        {
          id: 'a',
          width: 100,
          height: 30,
          side: 'left',
          collapsed: true,
          children: [
            { id: 'a1', width: 100, height: 30, side: null, collapsed: false, children: [] },
          ],
        },
      ],
    });
  });

  it('takes sizes from sizeOf when given', () => {
    const index = buildIndex(snapshot([{ id: 'r' }, { id: 'a', parent: 'r' }]));
    const tree = toLayoutTree(index, 'r', () => ({ width: 7, height: 9 }));
    expect(tree.children[0]).toMatchObject({ width: 7, height: 9 });
  });
});
