import { describe, expect, it } from 'vitest';
import { formatStyle, getStyleValue, parseStyle, setStyleValues } from '../../src/style.js';

describe('style helpers', () => {
  it('parses keys, values and bare tokens in order', () => {
    const entries = parseStyle('ellipse;whiteSpace=wrap;mindmap=1;;');
    expect([...entries]).toEqual([
      ['ellipse', null],
      ['whiteSpace', 'wrap'],
      ['mindmap', '1'],
    ]);
    expect(formatStyle(entries)).toBe('ellipse;whiteSpace=wrap;mindmap=1;');
  });

  it('handles empty and missing styles', () => {
    expect(parseStyle(null).size).toBe(0);
    expect(parseStyle('').size).toBe(0);
    expect(setStyleValues(undefined, { a: 1 })).toBe('a=1;');
  });

  it('keeps values that contain "="', () => {
    expect(getStyleValue('image=data:image/png,a=b;x=1', 'image')).toBe('data:image/png,a=b');
  });

  it('reads values; absent keys are undefined, bare tokens null', () => {
    expect(getStyleValue('rounded;mmOrder=3', 'mmOrder')).toBe('3');
    expect(getStyleValue('rounded;mmOrder=3', 'rounded')).toBe(null);
    expect(getStyleValue('rounded;mmOrder=3', 'nope')).toBeUndefined();
  });

  it('sets, replaces in place and removes keys', () => {
    expect(setStyleValues('a=1;b=2;c=3;', { b: 'x', c: null, d: 4 })).toBe('a=1;b=x;d=4;');
  });
});
