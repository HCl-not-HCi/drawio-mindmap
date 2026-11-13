// Conversion between plain text (commands, outlines) and draw.io HTML labels (html=1).

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Plain text → HTML label: escaped, newlines as <br>. */
export function textToHtml(text) {
  return String(text ?? '')
    .replace(/[&<>"']/g, (c) => ENTITIES[c])
    .replace(/\r?\n/g, '<br>');
}

/**
 * HTML label → plain text. Block elements and <br> become newlines.
 * Uses an inert document (DOMParser), so nothing in the label is loaded or run.
 * @param {string} html
 * @param {DOMParser} [parser]
 */
export function htmlToText(html, parser = new DOMParser()) {
  if (html == null || html === '') return '';
  const marked = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6])>/gi, '\n');
  const doc = parser.parseFromString(`<body>${marked}</body>`, 'text/html');
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n+$/, '');
}
