import { describe, expect, it } from 'vitest';
import {
  assignBranches,
  edgeStyleValues,
  PALETTE,
  styleSignature,
  topicStyleValues,
} from '../../src/styles.js';

// WCAG relative luminance and contrast ratio.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// Canvas and default text colors of draw.io's light and dark themes.
const LIGHT = { canvas: '#ffffff', text: '#000000' };
const DARK = { canvas: '#121212', text: '#f0f0f0' };

describe('branch palette', () => {
  it.each(PALETTE.map((p, i) => [i, p]))('color %i is readable in both themes', (i, p) => {
    // Lines and outlines: 3:1 against the canvas (WCAG non-text contrast).
    expect(contrast(p.stroke[0], LIGHT.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.stroke[1], DARK.canvas)).toBeGreaterThanOrEqual(3);
    // Text on first-level fills: 4.5:1 with the theme's default text color.
    expect(contrast(p.fill[0], LIGHT.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.fill[1], DARK.text)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('level styles', () => {
  it('colors first-level topics with fill and stroke, deeper ones with stroke only', () => {
    expect(topicStyleValues(1, 0)).toMatchObject({
      fontSize: 14,
      strokeColor: 'light-dark(#2563eb,#60a5fa)',
      fillColor: 'light-dark(#dbeafe,#1e3a8a)',
    });
    expect(topicStyleValues(3, 1)).toMatchObject({
      fontSize: 12,
      strokeColor: 'light-dark(#16a34a,#4ade80)',
      fillColor: 'default',
    });
    expect(topicStyleValues(0, 0)).not.toHaveProperty('strokeColor');
  });

  it('wraps branch indexes around the palette', () => {
    expect(topicStyleValues(1, PALETTE.length).strokeColor).toBe(
      topicStyleValues(1, 0).strokeColor,
    );
    expect(edgeStyleValues(2, 9).strokeColor).toBe(edgeStyleValues(1, 1).strokeColor);
  });

  it('signatures distinguish root, level 1, deeper levels and branches', () => {
    expect(styleSignature(0, 3)).toBe('1.root');
    expect(styleSignature(1, 3)).toBe('1.1.3');
    expect(styleSignature(2, 3)).toBe(styleSignature(5, 3));
    expect(styleSignature(2, 3)).not.toBe(styleSignature(2, 4));
  });
});

describe('assignBranches', () => {
  it('keeps existing indexes and fills gaps with the lowest unused ones', () => {
    expect(assignBranches([null, null, null])).toEqual([0, 1, 2]);
    expect(assignBranches([2, null, 0, null])).toEqual([2, 1, 0, 3]);
    expect(assignBranches([null, 1, -1, 2.5])).toEqual([0, 1, 2, 3]);
  });

  it('wraps around once every color is used', () => {
    expect(assignBranches([0, 1, null, null], 2)).toEqual([0, 1, 0, 1]);
  });
});
