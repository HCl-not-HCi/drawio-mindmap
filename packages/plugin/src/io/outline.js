// Outline: the format-neutral tree used by import, export and (M6) the LLM bridge.
//   { label: string, children: Outline[], side?: 'left'|'right', collapsed?: true }
// `side` is only meaningful on first-level nodes.

export const node = (label, children = []) => ({ label, children });

/** One root from a forest: a single top-level node, or a new root around several. */
export function toSingleRoot(forest, fallbackLabel = 'Imported') {
  if (forest.length === 1) return forest[0];
  return node(fallbackLabel, forest);
}

/** Outline from window.mindmap.getMindmap() style objects (drops ids). */
export function fromTopicOutline(topic) {
  const out = node(topic.label, topic.children.map(fromTopicOutline));
  if (topic.side) out.side = topic.side;
  if (topic.collapsed) out.collapsed = true;
  return out;
}

/** Strips optional fields, for comparisons in tests and round trips. */
export const labelsOnly = (n) => node(n.label, n.children.map(labelsOnly));

export function detectFormat(filename, text) {
  const name = (filename ?? '').toLowerCase();
  if (name.endsWith('.mm')) return 'freemind';
  if (name.endsWith('.opml')) return 'opml';
  if (/\.(md|markdown|txt)$/.test(name)) return 'markdown';
  const head = text.trimStart().slice(0, 200);
  if (/^<map[\s>]/.test(head)) return 'freemind';
  if (/<opml[\s>]/.test(head)) return 'opml';
  return 'markdown';
}

export const EXTENSIONS = { markdown: 'md', opml: 'opml', freemind: 'mm' };
export const MIME_TYPES = {
  markdown: 'text/markdown',
  opml: 'text/x-opml',
  freemind: 'application/x-freemind',
};

/** Escapes text for an XML attribute value; newlines are kept as character references. */
export function xmlAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '&#10;');
}

/** Parses XML or throws a readable error. */
export function parseXml(text, parser = new DOMParser()) {
  const doc = parser.parseFromString(text, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new Error(`Not valid XML: ${error.textContent.trim().split('\n')[0]}`);
  return doc;
}

/** Direct child elements with a tag name (case-sensitive, as in XML). */
export const childElements = (el, tag) =>
  Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.nodeName === tag);
