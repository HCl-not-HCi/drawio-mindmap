import { describe, expect, it } from 'vitest';
import { planDrop } from '../../src/drop.js';
import { buildIndex } from '../../src/model.js';

// root at x 0..100; right column x 200..300 (R1, R2, R3 at y 0/50/100); R1 has R1a at
// x 400..500; left column x -200..-100 (L1 at y 0).
function cells(overrides = {}) {
  const out = [];
  const topic = (id, parent, extra, geometry) => {
    out.push({
      id,
      vertex: true,
      style: `mindmap=1;mmRole=${parent ? 'topic' : 'root'};${extra}`,
      geometry: { width: 100, height: 30, ...geometry, ...overrides[id] },
    });
    if (parent)
      out.push({ id: `e-${id}`, edge: true, style: 'mmEdge=1', source: parent, target: id });
  };
  topic('root', null, '', { x: 0, y: 50 });
  topic('R1', 'root', 'mmOrder=0;mmSide=right;', { x: 200, y: 0 });
  topic('L1', 'root', 'mmOrder=1;mmSide=left;', { x: -200, y: 0 });
  topic('R2', 'root', 'mmOrder=2;mmSide=right;', { x: 200, y: 50 });
  topic('R3', 'root', 'mmOrder=3;mmSide=right;', { x: 200, y: 100 });
  topic('R1a', 'R1', 'mmOrder=0;', { x: 400, y: 0 });
  return out;
}

const plan = (id, geometry) => planDrop(buildIndex(cells({ [id]: geometry })), id);

describe('planDrop', () => {
  it('reparents onto another topic', () => {
    expect(plan('R3', { x: 380, y: 5 })).toEqual({ parentId: 'R1a', beforeId: null, side: null });
    expect(plan('R1a', { x: 210, y: 55 })).toEqual({ parentId: 'R2', beforeId: null, side: null });
  });

  it('ignores drops onto the own subtree or the current parent', () => {
    expect(plan('R1', { x: 390, y: 0 })).toBeNull(); // onto its own child
    expect(plan('R1a', { x: 190, y: 0 })).toBeNull(); // onto its parent
  });

  it('reorders when dropped on the top or bottom quarter of a sibling', () => {
    // R2 spans y 50..80; centre of R3 (height 30) at y 52 → top quarter of R2.
    expect(plan('R3', { x: 200, y: 37 })).toEqual({
      parentId: 'root',
      beforeId: 'R2',
      side: 'right',
    });
    expect(plan('R3', { x: 200, y: 50 })).toEqual({ parentId: 'R2', beforeId: null, side: null });
  });

  it('reorders among siblings by vertical position', () => {
    expect(plan('R3', { x: 200, y: 20 })).toEqual({
      parentId: 'root',
      beforeId: 'R2',
      side: 'right',
    });
    expect(plan('R1', { x: 200, y: 130 })).toEqual({
      parentId: 'root',
      beforeId: null,
      side: 'right',
    });
  });

  it('switches sides on the first level', () => {
    expect(plan('R2', { x: -200, y: 40 })).toEqual({
      parentId: 'root',
      beforeId: null,
      side: 'left',
    });
    expect(plan('R2', { x: -200, y: -40 })).toEqual({
      parentId: 'root',
      beforeId: 'L1',
      side: 'left',
    });
  });

  it('does nothing when dropped far away or back in place', () => {
    expect(plan('R2', { x: 900, y: 50 })).toBeNull();
    expect(plan('R2', { x: 205, y: 52 })).toBeNull();
    expect(plan('R1a', { x: 700, y: 0 })).toBeNull();
  });

  it('attaches a detached topic only when dropped onto a topic', () => {
    const c = cells({ X: { x: 210, y: 55 } });
    c.push({
      id: 'X',
      vertex: true,
      style: 'mindmap=1;mmRole=topic;',
      geometry: { x: 210, y: 55, width: 100, height: 30 },
    });
    expect(planDrop(buildIndex(c), 'X')).toEqual({ parentId: 'R2', beforeId: null, side: null });
    c.at(-1).geometry = { x: 900, y: 900, width: 100, height: 30 };
    expect(planDrop(buildIndex(c), 'X')).toBeNull();
  });

  it('never moves roots', () => {
    expect(plan('root', { x: 210, y: 5 })).toBeNull();
  });
});
