// Styles: level styles, branch palette, sizing and connectors, all configured here.
import { setStyleValues } from './style.js';
import {
  KEY_EDGE,
  KEY_MINDMAP,
  KEY_ORDER,
  KEY_ROLE,
  KEY_SIDE,
  ROLE_ROOT,
  ROLE_TOPIC,
} from './model.js';

/** Initial sizes; the layout then fits every topic to its label (see SIZING). */
export const SIZES = {
  root: { width: 160, height: 60 },
  topic: { width: 120, height: 36 },
};

/**
 * Topics grow with their label up to maxWidth, then wrap. Padding is added to the
 * label's measured size; the ellipse of the root needs more room than a rounded box.
 */
export const SIZING = {
  root: { minWidth: 120, minHeight: 56, maxWidth: 280, padX: 36, padY: 24 },
  topic: { minWidth: 60, minHeight: 32, maxWidth: 220, padX: 20, padY: 10 },
};

export const DEFAULT_LABELS = { root: 'Central Topic', topic: 'Topic' };

/**
 * Branch palette: one color per first-level branch, inherited by its descendants.
 * Each value is a light-dark(light, dark) pair, so draw.io picks the right one for its
 * light and dark theme. Contrast is checked against both canvases in the unit tests.
 */
export const PALETTE = [
  { stroke: ['#2563eb', '#60a5fa'], fill: ['#dbeafe', '#1e3a8a'] }, // blue
  { stroke: ['#16a34a', '#4ade80'], fill: ['#dcfce7', '#14532d'] }, // green
  { stroke: ['#ea580c', '#fb923c'], fill: ['#ffedd5', '#7c2d12'] }, // orange
  { stroke: ['#9333ea', '#c084fc'], fill: ['#f3e8ff', '#581c87'] }, // purple
  { stroke: ['#0d9488', '#2dd4bf'], fill: ['#ccfbf1', '#134e4a'] }, // teal
  { stroke: ['#dc2626', '#f87171'], fill: ['#fee2e2', '#7f1d1d'] }, // red
  { stroke: ['#a16207', '#facc15'], fill: ['#fef9c3', '#713f12'] }, // amber
  { stroke: ['#db2777', '#f472b6'], fill: ['#fce7f3', '#831843'] }, // pink
];

export const lightDark = ([light, dark]) => `light-dark(${light},${dark})`;

/**
 * Palette indexes for first-level branches, in order. Existing indexes are kept, so
 * colors never change when branches are added, removed or moved; new branches get the
 * lowest unused index (wrapping around once all are used).
 * @param {(number|null)[]} existing current index per branch, null if none
 */
export function assignBranches(existing, size = PALETTE.length) {
  const valid = (b) => Number.isInteger(b) && b >= 0;
  const used = new Set(existing.filter(valid).map((b) => b % size));
  let wrap = 0;
  return existing.map((b) => {
    if (valid(b)) return b;
    for (let i = 0; i < size; i++) {
      if (!used.has(i)) {
        used.add(i);
        return i;
      }
    }
    return wrap++ % size;
  });
}

/**
 * Style keys the plugin manages per level. They are applied when a topic is created or
 * changes level or branch; manual changes in between are kept (decisions D18).
 * Bump STYLE_VERSION to restyle existing maps after changing these.
 */
export const STYLE_VERSION = 1;
export const LEVEL_STYLES = {
  root: { fontSize: 18, fontStyle: 1, strokeWidth: 2, fillColor: 'default' },
  1: { fontSize: 14, fontStyle: 1, strokeWidth: 2 },
  2: { fontSize: 12, fontStyle: 0, strokeWidth: 1.5, fillColor: 'default' },
};
export const EDGE_LEVEL_STYLES = {
  1: { strokeWidth: 2.5 },
  2: { strokeWidth: 1.5 },
};

const levelKey = (level) => (level === 0 ? 'root' : level === 1 ? 1 : 2);

/** Managed style values for a topic at `level` (0 = root) in branch `branch`. */
export function topicStyleValues(level, branch) {
  const values = { ...LEVEL_STYLES[levelKey(level)] };
  if (level > 0) {
    const colors = PALETTE[branch % PALETTE.length];
    values.strokeColor = lightDark(colors.stroke);
    if (level === 1) values.fillColor = lightDark(colors.fill);
  }
  return values;
}

/** Managed style values for the edge leading to a topic at `level` in `branch`. */
export function edgeStyleValues(level, branch) {
  const colors = PALETTE[branch % PALETTE.length];
  return { ...EDGE_LEVEL_STYLES[level === 1 ? 1 : 2], strokeColor: lightDark(colors.stroke) };
}

/** Marker of what was applied last; restyling happens when it changes. */
export const styleSignature = (level, branch) =>
  level === 0 ? `${STYLE_VERSION}.root` : `${STYLE_VERSION}.${levelKey(level)}.${branch}`;

const ROOT_BASE = 'ellipse;whiteSpace=wrap;html=1;';
const TOPIC_BASE = 'rounded=1;arcSize=40;whiteSpace=wrap;html=1;';

/**
 * Curved connectors. entityRelationEdgeStyle always leaves and enters on the left or
 * right side, facing the other end, so it attaches correctly on both sides of the map.
 */
export const EDGE_STYLE_VALUES = {
  edgeStyle: 'entityRelationEdgeStyle',
  curved: 1,
  // Straight stub at each end. The default (~30px) overlaps within the topic gap and
  // makes the curve loop back; draw.io's own mindmap template uses 10.
  segment: 10,
  endArrow: 'none',
  startArrow: 'none',
  html: 1,
  rounded: 0,
  [KEY_EDGE]: 1,
};

export const rootStyle = () =>
  setStyleValues(ROOT_BASE, { [KEY_MINDMAP]: 1, [KEY_ROLE]: ROLE_ROOT });

export const topicStyle = (order, side) =>
  setStyleValues(TOPIC_BASE, {
    [KEY_MINDMAP]: 1,
    [KEY_ROLE]: ROLE_TOPIC,
    [KEY_ORDER]: order,
    [KEY_SIDE]: side,
  });

export const edgeStyle = () => setStyleValues('', EDGE_STYLE_VALUES);
