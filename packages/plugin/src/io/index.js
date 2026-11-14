// Format dispatch for import and export.
import { parseFreemind, serializeFreemind } from './freemind.js';
import { parseMarkdown, serializeMarkdown } from './markdown.js';
import { parseOpml, serializeOpml } from './opml.js';
import { detectFormat, toSingleRoot } from './outline.js';

export const FORMATS = ['markdown', 'opml', 'freemind'];

/**
 * Parses text into one outline root.
 * @param {{format?: string, filename?: string, parser?: DOMParser}} [options]
 */
export function parseOutline(text, { format, filename, parser } = {}) {
  const fmt = format ?? detectFormat(filename, text);
  const fallback = filename ? filename.replace(/\.[^.]+$/, '') : 'Imported';
  switch (fmt) {
    case 'markdown': {
      const forest = parseMarkdown(text);
      if (forest.length === 0) throw new Error('The text contains no topics.');
      return toSingleRoot(forest, fallback);
    }
    case 'opml': {
      const { forest, title } = parseOpml(text, parser);
      if (forest.length === 0) throw new Error('The OPML file contains no outlines.');
      return toSingleRoot(forest, title ?? fallback);
    }
    case 'freemind':
      return parseFreemind(text, parser);
    default:
      throw new Error(`Unknown format: ${fmt}`);
  }
}

export function serializeOutline(root, format) {
  switch (format) {
    case 'markdown':
      return serializeMarkdown(root);
    case 'opml':
      return serializeOpml(root);
    case 'freemind':
      return serializeFreemind(root);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}
