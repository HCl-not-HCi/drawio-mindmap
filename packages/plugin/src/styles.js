// Default styles per level. Colors are left to draw.io's defaults (theme-aware);
// level styles and branch colors come in M4.
import { setStyleValues } from './style.js';
import { KEY_EDGE, KEY_MINDMAP, KEY_ORDER, KEY_ROLE, ROLE_ROOT, ROLE_TOPIC } from './model.js';

export const SIZES = {
  root: { width: 160, height: 60 },
  topic: { width: 120, height: 36 },
};

export const DEFAULT_LABELS = { root: 'Central Topic', topic: 'Topic' };

const ROOT_BASE = 'ellipse;whiteSpace=wrap;html=1;fontSize=16;fontStyle=1;';
const TOPIC_BASE = 'rounded=1;arcSize=40;whiteSpace=wrap;html=1;fontSize=13;';
const EDGE_BASE = 'endArrow=none;html=1;rounded=0;';

export const rootStyle = () =>
  setStyleValues(ROOT_BASE, { [KEY_MINDMAP]: 1, [KEY_ROLE]: ROLE_ROOT });

export const topicStyle = (order) =>
  setStyleValues(TOPIC_BASE, { [KEY_MINDMAP]: 1, [KEY_ROLE]: ROLE_TOPIC, [KEY_ORDER]: order });

export const edgeStyle = () => setStyleValues(EDGE_BASE, { [KEY_EDGE]: 1 });
