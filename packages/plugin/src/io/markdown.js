// Markdown outlines: headings and nested lists, and plain indented text (for pasting).
//
// Parsing: a heading's parent is the closest previous heading of a lower level. List
// items (and plain lines) nest by indentation: an item's parent is the closest previous
// item with less indentation, or else the closest heading. Indentation of any width
// works (2 or 4 spaces, tabs). Blank lines and fenced code blocks are skipped.
// Labels: "<br>" stands for a line break inside a topic.
import { node } from './outline.js';

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const ITEM = /^([ \t]*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const PLAIN = /^([ \t]*)(\S.*)$/;
const FENCE = /^\s*(```|~~~)/;

const indentWidth = (ws) => [...ws].reduce((w, c) => w + (c === '\t' ? 4 : 1), 0);
const decode = (text) => text.replace(/<br\s*\/?>/gi, '\n').trim();
const encode = (label) => String(label).replace(/\r?\n/g, '<br>').trim();

/** @returns {Outline[]} top-level nodes */
export function parseMarkdown(text) {
  const forest = [];
  const stack = []; // { kind: 'heading'|'item', level|indent, node }
  let inFence = false;

  const attach = (n) => {
    const parent = stack.at(-1);
    (parent ? parent.node.children : forest).push(n);
  };

  for (const line of String(text).split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line.trim() === '') continue;

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      while (stack.length > 0 && (stack.at(-1).kind === 'item' || stack.at(-1).level >= level)) {
        stack.pop();
      }
      const n = node(decode(heading[2]));
      attach(n);
      stack.push({ kind: 'heading', level, node: n });
      continue;
    }

    const item = ITEM.exec(line) ?? PLAIN.exec(line);
    const indent = indentWidth(item[1]);
    while (stack.length > 0 && stack.at(-1).kind === 'item' && stack.at(-1).indent >= indent) {
      stack.pop();
    }
    const n = node(decode(item[2]));
    attach(n);
    stack.push({ kind: 'item', indent, node: n });
  }
  return forest;
}

/** The root as a heading, everything below as a nested list (2-space indents). */
export function serializeMarkdown(root) {
  const lines = [`# ${encode(root.label)}`, ''];
  const visit = (n, depth) => {
    lines.push(`${'  '.repeat(depth)}- ${encode(n.label)}`);
    n.children.forEach((c) => visit(c, depth + 1));
  };
  root.children.forEach((c) => visit(c, 0));
  return `${lines.join('\n')}\n`;
}
