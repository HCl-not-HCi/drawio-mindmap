// Default styles per level. Colors are left to draw.io's defaults (theme-aware);
// level styles and branch colors come in M4.
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

const ROOT_BASE = 'ellipse;whiteSpace=wrap;html=1;fontSize=16;fontStyle=1;';
const TOPIC_BASE = 'rounded=1;arcSize=40;whiteSpace=wrap;html=1;fontSize=13;';

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
