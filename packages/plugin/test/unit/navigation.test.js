import { describe, expect, it } from 'vitest';
import { buildIndex } from '../../src/model.js';
import { navigate, sideOf } from '../../src/navigation.js';

// Map:        L1a          R1 ── R1a (y 0)
//       L1 ──┤      root ──┤      R1b (y 40)
//             L1b          │      R1c (y 80)
//       L2                 R2
function cells() {
  const out = [];
  const topic = (id, parent, extra = '', geometry = {}) => {
    out.push({
      id,
      vertex: true,
      style: `mindmap=1;mmRole=${parent ? 'topic' : 'root'};${extra}`,
      geometry: { x: 0, y: 0, width: 100, height: 30, ...geometry },
      label: id,
    });
    if (parent) {
      out.push({ id: `e-${id}`, edge: true, style: 'mmEdge=1', source: parent, target: id });
    }
  };
  topic('root', null, '', { y: 40 });
  topic('R1', 'root', 'mmOrder=0;mmSide=right;', { y: 40 });
  topic('L1', 'root', 'mmOrder=1;mmSide=left;', { y: 20 });
  topic('R2', 'root', 'mmOrder=2;mmSide=right;', { y: 120 });
  topic('L2', 'root', 'mmOrder=3;mmSide=left;', { y: 100 });
  topic('R1a', 'R1', 'mmOrder=0;', { y: 0 });
  topic('R1b', 'R1', 'mmOrder=1;', { y: 40 });
  topic('R1c', 'R1', 'mmOrder=2;', { y: 80 });
  topic('L1a', 'L1', 'mmOrder=0;', { y: 0 });
  topic('L1b', 'L1', 'mmOrder=1;', { y: 40 });
  return out;
}

const index = buildIndex(cells());
const nav = (id, dir) => navigate(index, id, dir);

describe('sideOf', () => {
  it('inherits the first-level side; roots have none', () => {
    expect(sideOf(index, 'root')).toBeNull();
    expect(sideOf(index, 'R1b')).toBe('right');
    expect(sideOf(index, 'L1a')).toBe('left');
  });
});

describe('navigate', () => {
  it('enters each side from the root at the vertically closest topic', () => {
    expect(nav('root', 'right')).toBe('R1');
    expect(nav('root', 'left')).toBe('L1');
    expect(nav('root', 'up')).toBeNull();
  });

  it('goes outward to the closest child and inward to the parent', () => {
    expect(nav('R1', 'right')).toBe('R1b');
    expect(nav('R1b', 'left')).toBe('R1');
    expect(nav('R1', 'left')).toBe('root');
    expect(nav('L1', 'left')).toBe('L1a');
    expect(nav('L1a', 'right')).toBe('L1');
    expect(nav('L1', 'right')).toBe('root');
  });

  it('stops at leaves', () => {
    expect(nav('R1a', 'right')).toBeNull();
    expect(nav('L1b', 'left')).toBeNull();
  });

  it('moves between siblings, staying on the same side at the first level', () => {
    expect(nav('R1b', 'up')).toBe('R1a');
    expect(nav('R1b', 'down')).toBe('R1c');
    expect(nav('R1c', 'down')).toBeNull();
    expect(nav('R1', 'down')).toBe('R2');
    expect(nav('L1', 'down')).toBe('L2');
    expect(nav('R2', 'up')).toBe('R1');
  });

  it('does not enter collapsed topics', () => {
    const c = cells();
    c.find((x) => x.id === 'R1').style += 'mmCollapsed=1;';
    expect(navigate(buildIndex(c), 'R1', 'right')).toBeNull();
  });
});
