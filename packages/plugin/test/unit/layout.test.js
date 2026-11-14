import { describe, expect, it } from 'vitest';
import {
  assignSides,
  chooseSide,
  DEFAULT_SPACING as S,
  layoutTree,
  LEFT,
  measure,
  RIGHT,
} from '../../src/layout.js';

const node = (id, children = [], extra = {}) => ({
  id,
  width: 100,
  height: 30,
  children,
  ...extra,
});

// Deterministic pseudo-random tree for property tests.
function randomTree(seed, size) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const nodes = [node('root', [], { width: 160, height: 60 })];
  for (let i = 1; i < size; i++) {
    const parent = nodes[Math.floor(rnd() * nodes.length)];
    const n = node(`n${i}`, [], {
      width: 60 + Math.floor(rnd() * 140),
      height: 24 + Math.floor(rnd() * 50),
    });
    parent.children.push(n);
    nodes.push(n);
  }
  return { root: nodes[0], nodes };
}

function rects(tree, positions) {
  const out = [];
  const visit = (n, parent) => {
    const p = positions.get(n.id);
    if (p) out.push({ id: n.id, parent, x: p.x, y: p.y, w: n.width, h: n.height, n });
    if (!n.collapsed) n.children.forEach((c) => visit(c, n.id));
  };
  visit(tree, null);
  return out;
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('measure', () => {
  it('is the node height for leaves and the stacked children otherwise', () => {
    const tree = node('r', [node('a'), node('b', [node('b1'), node('b2'), node('b3')])]);
    const h = measure(tree);
    expect(h.get('a')).toBe(30);
    expect(h.get('b')).toBe(3 * 30 + 2 * S.vGap);
    expect(h.get('r')).toBe(30 + h.get('b') + S.vGap);
  });

  it('uses the node height when it is taller than its children', () => {
    expect(measure(node('r', [node('a')], { height: 200 })).get('r')).toBe(200);
  });
});

describe('sides', () => {
  it('alternates by subtree height and keeps explicit sides', () => {
    const tall = node('tall', [node('t1'), node('t2'), node('t3')]);
    const tree = node('r', [tall, node('a'), node('b'), node('c', [], { side: RIGHT })]);
    const sides = assignSides(tree, measure(tree));
    // c is fixed right; tall then goes left (shorter), a and b fill the right side.
    expect(Object.fromEntries(sides)).toEqual({ c: RIGHT, tall: LEFT, a: RIGHT, b: RIGHT });
  });

  it('chooses the shorter side for a new topic, right on ties', () => {
    expect(chooseSide(node('r'))).toBe(RIGHT);
    expect(chooseSide(node('r', [node('a', [], { side: RIGHT })]))).toBe(LEFT);
    expect(
      chooseSide(node('r', [node('a', [], { side: RIGHT }), node('b', [], { side: LEFT })])),
    ).toBe(RIGHT);
  });
});

describe('layoutTree', () => {
  it('lays out a small map (snapshot)', () => {
    const tree = node('root', [node('a', [node('a1'), node('a2')]), node('b'), node('c')], {
      width: 160,
      height: 60,
    });
    const { positions, sides } = layoutTree(tree);
    expect(Object.fromEntries(sides)).toEqual({ a: RIGHT, b: LEFT, c: LEFT });
    expect(Object.fromEntries(positions)).toMatchInlineSnapshot(`
      {
        "a": {
          "x": 230,
          "y": 15,
        },
        "a1": {
          "x": 380,
          "y": -6,
        },
        "a2": {
          "x": 380,
          "y": 36,
        },
        "b": {
          "x": -170,
          "y": -6,
        },
        "c": {
          "x": -170,
          "y": 36,
        },
        "root": {
          "x": 0,
          "y": 0,
        },
      }
    `);
  });

  it('places right children right of the parent and left children mirrored', () => {
    const tree = node('r', [node('a', [node('a1')]), node('b', [node('b1')])]);
    const { positions: p } = layoutTree(tree);
    expect(p.get('a').x).toBe(100 + S.rootGap);
    expect(p.get('a1').x).toBe(p.get('a').x + 100 + S.hGap);
    expect(p.get('b').x).toBe(-S.rootGap - 100);
    expect(p.get('b1').x).toBe(p.get('b').x - S.hGap - 100);
  });

  it('centres parents on their children and the sides on the root', () => {
    const tree = node('r', [node('a', [node('a1'), node('a2'), node('a3')])]);
    const { positions: p } = layoutTree(tree);
    const mid = (id) => p.get(id).y + 15;
    expect(mid('a')).toBe((mid('a1') + mid('a3')) / 2);
    expect(mid('a')).toBe(mid('r'));
  });

  it('keeps sibling order top to bottom on both sides', () => {
    const tree = node('r', [
      node('a', [], { side: LEFT }),
      node('b', [], { side: LEFT }),
      node('c', [], { side: RIGHT }),
      node('d', [], { side: RIGHT }),
    ]);
    const { positions: p } = layoutTree(tree);
    expect(p.get('a').y).toBeLessThan(p.get('b').y);
    expect(p.get('c').y).toBeLessThan(p.get('d').y);
  });

  it('skips children of collapsed topics', () => {
    const tree = node('r', [node('a', [node('a1', [node('a11')])], { collapsed: true })]);
    const { positions } = layoutTree(tree);
    expect([...positions.keys()].sort()).toEqual(['a', 'r']);
  });

  it('never overlaps topics, for many random trees', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { root } = randomTree(seed, 80);
      const { positions } = layoutTree(root);
      const all = rects(root, positions);
      expect(all).toHaveLength(80);
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          if (overlaps(all[i], all[j])) {
            throw new Error(`seed ${seed}: ${all[i].id} overlaps ${all[j].id}`);
          }
        }
      }
    }
  });

  it('keeps every child on the outer side of its parent', () => {
    const { root } = randomTree(7, 120);
    const { positions } = layoutTree(root);
    const byId = new Map(rects(root, positions).map((r) => [r.id, r]));
    for (const r of byId.values()) {
      if (r.parent == null || r.parent === 'root') continue;
      const p = byId.get(r.parent);
      const onRight = p.x > 0;
      if (onRight) expect(r.x).toBe(p.x + p.w + S.hGap);
      else expect(r.x + r.w).toBe(p.x - S.hGap);
    }
  });

  it('lays out 5000 topics quickly', () => {
    const { root } = randomTree(3, 5000);
    const start = performance.now();
    layoutTree(root);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe('layout modes', () => {
  const tree = node('r', [
    node('a', [node('a1')], { side: LEFT }),
    node('b', [], { side: RIGHT }),
    node('c'),
  ]);

  it('puts every branch on one side in right/left mode, ignoring own sides', () => {
    for (const mode of [RIGHT, LEFT]) {
      const { positions, sides } = layoutTree(tree, S, mode);
      expect([...sides.values()]).toEqual([mode, mode, mode]);
      for (const id of ['a', 'a1', 'b', 'c']) {
        if (mode === RIGHT) expect(positions.get(id).x).toBeGreaterThan(100);
        else expect(positions.get(id).x).toBeLessThan(0);
      }
    }
  });

  it('uses the given spacing', () => {
    const wide = { rootGap: 100, hGap: 70, vGap: 20 };
    const { positions: p } = layoutTree(node('r', [node('a', [node('a1'), node('a2')])]), wide);
    expect(p.get('a').x).toBe(200);
    expect(p.get('a1').x).toBe(370);
    expect(p.get('a2').y - p.get('a1').y).toBe(50);
  });
});
