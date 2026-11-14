import { describe, expect, it } from 'vitest';
import { planConversion } from '../../src/convert.js';

const v = (id, x, y) => ({
  id,
  vertex: true,
  style: 'rounded=1;',
  geometry: { x, y, width: 80, height: 30 },
});
const e = (id, source, target) => ({ id, edge: true, style: '', source, target });

describe('planConversion', () => {
  it('finds the root, orders children by y and keeps the drawn sides', () => {
    const cells = [
      v('c', 0, 100),
      v('r1', 200, 50),
      v('r2', 200, 150),
      v('l1', -200, 100),
      v('r1a', 400, 50),
      e('e1', 'c', 'r2'),
      e('e2', 'c', 'r1'),
      e('e3', 'c', 'l1'),
      e('e4', 'r1', 'r1a'),
    ];
    const plan = planConversion(cells, ['c', 'r1', 'r2', 'l1', 'r1a']);
    expect(plan.rootId).toBe('c');
    expect(plan.topics).toEqual(
      expect.arrayContaining([
        { id: 'r1', parentId: 'c', order: 0, side: 'right' },
        { id: 'l1', parentId: 'c', order: 1, side: 'left' },
        { id: 'r2', parentId: 'c', order: 2, side: 'right' },
        { id: 'r1a', parentId: 'r1', order: 0, side: null },
      ]),
    );
    expect(plan.edges.every((x) => !x.flip)).toBe(true);
  });

  it('picks the shape at the centre and flips connectors pointing towards it', () => {
    // a and c point at b; b is in the middle.
    const cells = [
      v('a', 0, 0),
      v('b', 100, 0),
      v('c', 200, 0),
      v('d', 100, 100),
      e('ab', 'a', 'b'),
      e('cb', 'c', 'b'),
      e('bd', 'b', 'd'),
    ];
    const plan = planConversion(cells, ['a', 'b', 'c', 'd']);
    expect(plan.rootId).toBe('b');
    expect(plan.edges.find((x) => x.id === 'ab').flip).toBe(true);
    expect(plan.edges.find((x) => x.id === 'bd').flip).toBe(false);
  });

  it('prefers a source shape when several are equally central', () => {
    // Chain a -> b: both have eccentricity 1; a has no incoming connector.
    const plan = planConversion([v('a', 0, 0), v('b', 100, 0), e('ab', 'a', 'b')], ['b', 'a']);
    expect(plan.rootId).toBe('a');
  });

  it('leaves cycle-closing connectors out of the tree', () => {
    const cells = [
      v('a', 0, 0),
      v('b', 100, 0),
      v('c', 100, 100),
      e('ab', 'a', 'b'),
      e('ac', 'a', 'c'),
      e('bc', 'b', 'c'),
    ];
    const plan = planConversion(cells, ['a', 'b', 'c']);
    expect(plan.edges.map((x) => x.id).sort()).toEqual(['ab', 'ac']);
  });

  it('ignores connectors to unselected shapes and rejects disconnected selections', () => {
    const cells = [
      v('a', 0, 0),
      v('b', 100, 0),
      v('x', 300, 0),
      e('ab', 'a', 'b'),
      e('bx', 'b', 'x'),
    ];
    expect(planConversion(cells, ['a', 'b']).edges.map((x) => x.id)).toEqual(['ab']);
    expect(() => planConversion([v('a', 0, 0), v('b', 9, 9)], ['a', 'b'])).toThrow(
      /connected tree/,
    );
    expect(() => planConversion(cells, [])).toThrow(/Select the shapes/);
  });

  it('converts a single shape into a root', () => {
    expect(planConversion([v('a', 0, 0)], ['a'])).toEqual({ rootId: 'a', topics: [], edges: [] });
  });
});
