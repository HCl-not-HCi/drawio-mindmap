// OPML 2.0 outlines (<outline text="...">), as used by outliners and many mindmap tools.
import { childElements, node, parseXml, xmlAttr } from './outline.js';

/**
 * @returns {{forest: Outline[], title: string|null}} top-level outlines of <body>
 */
export function parseOpml(text, parser) {
  const doc = parseXml(text, parser);
  const opml = doc.documentElement;
  if (opml.nodeName !== 'opml') throw new Error('Not an OPML file (no <opml> element).');
  const body = childElements(opml, 'body')[0];
  if (!body) throw new Error('Not an OPML file (no <body> element).');
  const title = childElements(childElements(opml, 'head')[0] ?? opml, 'title')[0];
  const visit = (el) =>
    node(
      (el.getAttribute('text') ?? el.getAttribute('title') ?? '').trim(),
      childElements(el, 'outline').map(visit),
    );
  return {
    forest: childElements(body, 'outline').map(visit),
    title: title?.textContent.trim() || null,
  };
}

/** The root becomes the single top-level outline and the document title. */
export function serializeOpml(root) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>${xmlAttr(root.label)}</title></head>`,
    '  <body>',
  ];
  const visit = (n, depth) => {
    const pad = '  '.repeat(depth);
    if (n.children.length === 0) {
      lines.push(`${pad}<outline text="${xmlAttr(n.label)}"/>`);
      return;
    }
    lines.push(`${pad}<outline text="${xmlAttr(n.label)}">`);
    n.children.forEach((c) => visit(c, depth + 1));
    lines.push(`${pad}</outline>`);
  };
  visit(root, 2);
  lines.push('  </body>', '</opml>');
  return `${lines.join('\n')}\n`;
}
