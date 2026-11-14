// FreeMind / Freeplane .mm files: <map><node TEXT="..." POSITION="left" FOLDED="true">.
// Keeps first-level sides (POSITION) and collapsed state (FOLDED) in both directions.
// Rich-text nodes (<richcontent TYPE="NODE">) are imported as plain text.
import { childElements, node, parseXml, xmlAttr } from './outline.js';

function labelOf(el) {
  const text = el.getAttribute('TEXT');
  if (text != null) return text.trim();
  const rich = childElements(el, 'richcontent').find(
    (r) => (r.getAttribute('TYPE') ?? 'NODE') === 'NODE',
  );
  return (rich?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** @returns {Outline} the root node */
export function parseFreemind(text, parser) {
  const doc = parseXml(text, parser);
  const map = doc.documentElement;
  if (map.nodeName !== 'map') throw new Error('Not a FreeMind file (no <map> element).');
  const rootEl = childElements(map, 'node')[0];
  if (!rootEl) throw new Error('The FreeMind file has no nodes.');
  const visit = (el, depth) => {
    const n = node(
      labelOf(el),
      childElements(el, 'node').map((c) => visit(c, depth + 1)),
    );
    const position = el.getAttribute('POSITION');
    if (depth === 1 && (position === 'left' || position === 'right')) n.side = position;
    if (el.getAttribute('FOLDED') === 'true') n.collapsed = true;
    return n;
  };
  return visit(rootEl, 0);
}

export function serializeFreemind(root) {
  const lines = ['<map version="1.0.1">'];
  const visit = (n, depth) => {
    const pad = '  '.repeat(depth + 1);
    let attrs = `TEXT="${xmlAttr(n.label)}"`;
    if (depth === 1 && n.side) attrs += ` POSITION="${n.side}"`;
    if (n.collapsed && n.children.length > 0) attrs += ' FOLDED="true"';
    if (n.children.length === 0) {
      lines.push(`${pad}<node ${attrs}/>`);
      return;
    }
    lines.push(`${pad}<node ${attrs}>`);
    n.children.forEach((c) => visit(c, depth + 1));
    lines.push(`${pad}</node>`);
  };
  visit(root, 0);
  lines.push('</map>');
  return `${lines.join('\n')}\n`;
}
