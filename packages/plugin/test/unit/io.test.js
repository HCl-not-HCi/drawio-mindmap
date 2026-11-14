import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseFreemind, serializeFreemind } from '../../src/io/freemind.js';
import { parseMarkdown, serializeMarkdown } from '../../src/io/markdown.js';
import { parseOpml, serializeOpml } from '../../src/io/opml.js';
import { detectFormat, labelsOnly, node, toSingleRoot } from '../../src/io/outline.js';

const parser = new new JSDOM().window.DOMParser();

// A map with markup characters, a multi-line label, sides and a collapsed branch.
const SAMPLE = {
  label: 'Trip <2027> & "friends"',
  children: [
    {
      label: 'Packing',
      side: 'right',
      collapsed: true,
      children: [node('Tent'), node("Stove's fuel"), node('Line 1\nLine 2')],
    },
    { label: 'Route', side: 'left', children: [node('Day 1', [node('Coast')]), node('Day 2')] },
    { label: 'Budget', side: 'right', children: [] },
  ],
};

describe('Markdown', () => {
  it('round-trips labels and structure', () => {
    const text = serializeMarkdown(SAMPLE);
    expect(parseMarkdown(text)).toEqual([labelsOnly(SAMPLE)]);
    expect(text).toMatchInlineSnapshot(`
      "# Trip <2027> & "friends"

      - Packing
        - Tent
        - Stove's fuel
        - Line 1<br>Line 2
      - Route
        - Day 1
          - Coast
        - Day 2
      - Budget
      "
    `);
  });

  it('reads headings and lists together', () => {
    const md = [
      '# Project',
      'Intro paragraph',
      '## Goals',
      '- Speed',
      '    - Startup time',
      '- Quality',
      '## Risks ##',
      '1. Scope',
      '2) Time',
      '### Mitigations',
      '* Weekly review',
    ].join('\n');
    expect(parseMarkdown(md)).toEqual([
      node('Project', [
        node('Intro paragraph'),
        node('Goals', [node('Speed', [node('Startup time')]), node('Quality')]),
        node('Risks', [node('Scope'), node('Time'), node('Mitigations', [node('Weekly review')])]),
      ]),
    ]);
  });

  it('reads plain indented text with tabs or spaces', () => {
    expect(parseMarkdown('Root\n\tA\n\t\tA1\n\tB\n')).toEqual([
      node('Root', [node('A', [node('A1')]), node('B')]),
    ]);
    expect(parseMarkdown('A\n  A1\n    A11\n  A2\nB')).toEqual([
      node('A', [node('A1', [node('A11')]), node('A2')]),
      node('B'),
    ]);
  });

  it('skips blank lines and code fences, and handles uneven indentation', () => {
    const md = '- A\n\n```\n- not a topic\n```\n   - A1\n - A2\n- B';
    expect(parseMarkdown(md)).toEqual([node('A', [node('A1'), node('A2')]), node('B')]);
  });
});

describe('OPML', () => {
  it('round-trips labels and structure', () => {
    const { forest, title } = parseOpml(serializeOpml(SAMPLE), parser);
    expect(forest).toEqual([labelsOnly(SAMPLE)]);
    expect(title).toBe(SAMPLE.label);
  });

  it('reads typical OPML with several top-level outlines', () => {
    const opml = `<?xml version="1.0"?>
      <opml version="2.0"><head><title>Notes</title></head><body>
        <outline text="A"><outline text="A1"/></outline>
        <outline title="B" _note="ignored"/>
      </body></opml>`;
    const { forest, title } = parseOpml(opml, parser);
    expect(toSingleRoot(forest, title)).toEqual(
      node('Notes', [node('A', [node('A1')]), node('B')]),
    );
  });

  it('rejects other XML and broken files', () => {
    expect(() => parseOpml('<map/>', parser)).toThrow('Not an OPML file');
    expect(() => parseOpml('<opml><body>', parser)).toThrow('Not valid XML');
  });
});

describe('FreeMind', () => {
  it('round-trips labels, structure, sides and collapsed state', () => {
    const text = serializeFreemind(SAMPLE);
    expect(parseFreemind(text, parser)).toEqual(SAMPLE);
    expect(text).toContain('<node TEXT="Packing" POSITION="right" FOLDED="true">');
    expect(text).toContain('TEXT="Line 1&#10;Line 2"');
  });

  it('reads rich-text nodes as plain text and ignores other elements', () => {
    const mm = `<map version="freeplane 1.9.0">
      <node TEXT="Root" ID="ID_1">
        <hook NAME="MapStyle"/>
        <node POSITION="left" ID="ID_2">
          <richcontent TYPE="NODE"><html><body><p>Rich <b>text</b></p></body></html></richcontent>
          <richcontent TYPE="NOTE"><html><body>note</body></html></richcontent>
          <node TEXT="Child"><icon BUILTIN="yes"/></node>
        </node>
      </node>
    </map>`;
    expect(parseFreemind(mm, parser)).toEqual({
      label: 'Root',
      children: [{ label: 'Rich text', side: 'left', children: [node('Child')] }],
    });
  });

  it('rejects other XML', () => {
    expect(() => parseFreemind('<opml/>', parser)).toThrow('Not a FreeMind file');
    expect(() => parseFreemind('<map/>', parser)).toThrow('no nodes');
  });
});

describe('detectFormat', () => {
  it('uses the file extension, then the content', () => {
    expect(detectFormat('a.MM', '')).toBe('freemind');
    expect(detectFormat('a.opml', '')).toBe('opml');
    expect(detectFormat('notes.md', '<map>')).toBe('markdown');
    expect(detectFormat(null, '  <map version="1.0.1">')).toBe('freemind');
    expect(detectFormat(null, '<?xml version="1.0"?>\n<opml version="2.0">')).toBe('opml');
    expect(detectFormat(null, '- a\n- b')).toBe('markdown');
  });
});
