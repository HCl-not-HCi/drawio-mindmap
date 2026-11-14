// M5: import/export (Markdown, OPML, FreeMind) and pasting outlines.
import { test, expect, clickMindmapMenuItem } from './fixtures.js';

/** Outline of a map as nested [label, [children...]] for compact assertions. */
const outlineOf = (page, id) =>
  page.evaluate((topicId) => {
    const strip = (n) => (n.children.length ? [n.label, n.children.map(strip)] : n.label);
    return strip(window.mindmap.getMindmap(topicId ?? undefined));
  }, id ?? null);

async function buildMap(page) {
  return page.evaluate(() => {
    const m = window.mindmap;
    const root = m.createMindmap({ label: 'Trip & <friends>', x: 300, y: 300 });
    const pack = m.addChild(root, 'Packing');
    m.addChild(pack, 'Tent');
    m.addChild(pack, 'Line 1\nLine 2');
    const route = m.addChild(root, 'Route');
    m.addChild(route, 'Coast');
    m.setSide([route], 'left');
    m.setCollapsed([pack], true);
    return { root, pack, route };
  });
}

const EXPECTED = [
  'Trip & <friends>',
  [
    ['Packing', ['Tent', 'Line 1\nLine 2']],
    ['Route', ['Coast']],
  ],
];

test('each format round-trips through export and import', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  for (const format of ['markdown', 'opml', 'freemind']) {
    const importedId = await page.evaluate(
      ([root, fmt]) =>
        window.mindmap.importText(window.mindmap.exportMindmap(root, fmt), { format: fmt }),
      [ids.root, format],
    );
    expect(await outlineOf(page, importedId), format).toEqual(EXPECTED);
  }
});

test('FreeMind keeps sides and collapsed branches', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const imported = await page.evaluate((root) => {
    const id = window.mindmap.importText(window.mindmap.exportMindmap(root, 'freemind'));
    return window.mindmap.getMindmap(id).children.map((c) => ({
      label: c.label,
      side: c.side,
      collapsed: c.collapsed ?? false,
    }));
  }, ids.root);
  expect(imported).toEqual([
    { label: 'Packing', side: 'right', collapsed: true },
    { label: 'Route', side: 'left', collapsed: false },
  ]);
});

test('an import is one undo step and is laid out like any map', async ({ drawio }) => {
  const { page } = drawio;
  const result = await page.evaluate(() => {
    const before = window.mindmap.listMindmaps().length;
    const id = window.mindmap.importText('# Plan\n- A\n  - A1\n- B\n- C', { format: 'markdown' });
    const { graph, ui } = window.mindmapDebug;
    const model = graph.getModel();
    const xs = window.mindmap
      .getMindmap(id)
      .children.map((c) => model.getGeometry(model.getCell(c.id)).x);
    const rootX = model.getGeometry(model.getCell(id)).x;
    ui.actions.get('undo').funct();
    return { before, after: window.mindmap.listMindmaps().length, xs, rootX };
  });
  expect(result.after).toBe(result.before);
  // Balanced: some branches left of the root, some right.
  expect(result.xs.some((x) => x < result.rootX)).toBe(true);
  expect(result.xs.some((x) => x > result.rootX)).toBe(true);
});

test('Import from File reads the chosen file', async ({ drawio }) => {
  const { page } = drawio;
  const chooser = page.waitForEvent('filechooser');
  await clickMindmapMenuItem(page, 'Import from File...');
  await (
    await chooser
  ).setFiles({
    name: 'notes.opml',
    mimeType: 'text/x-opml',
    buffer: Buffer.from(
      '<opml version="2.0"><head><title>Notes</title></head><body>' +
        '<outline text="One"/><outline text="Two"><outline text="Two a"/></outline></body></opml>',
    ),
  });
  await page.waitForFunction(() => window.mindmap.listMindmaps().length === 1);
  expect(await outlineOf(page)).toEqual(['Notes', ['One', ['Two', ['Two a']]]]);
  expect(await page.evaluate(() => window.mindmap.getSelectedTopics().length)).toBe(1);
});

test('Export as Markdown downloads the map', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  await page.evaluate((id) => window.mindmap.selectTopic(id), ids.route);
  const download = page.waitForEvent('download');
  await clickMindmapMenuItem(page, 'Export as');
  await page.getByRole('menuitem', { name: /^Markdown/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Trip & friends.md');
  const text = await (await file.createReadStream()).toArray();
  expect(Buffer.concat(text).toString('utf8')).toContain('# Trip & <friends>\n\n- Packing\n');
});

test.describe('paste outline', () => {
  const paste = (page, data) =>
    page.evaluate((entries) => {
      const dt = new DataTransfer();
      for (const [type, value] of Object.entries(entries)) dt.setData(type, value);
      document.activeElement.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, data);

  test('pasting indented text adds child topics in one undo step', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    await page.evaluate((id) => window.mindmap.selectTopic(id), ids.route);
    await paste(page, { 'text/plain': 'Inland\n\tHills\n\tLakes\nIslands' });
    expect(await outlineOf(page, ids.route)).toEqual([
      'Trip & <friends>',
      [
        ['Packing', ['Tent', 'Line 1\nLine 2']],
        ['Route', ['Coast', ['Inland', ['Hills', 'Lakes']], 'Islands']],
      ],
    ]);
    const selected = await page.evaluate(() => {
      const [id] = window.mindmap.getSelectedTopics();
      return window.mindmapDebug.graph.getModel().getCell(id).value;
    });
    expect(selected).toBe('Inland');

    await page.evaluate(() => window.mindmapDebug.ui.actions.get('undo').funct());
    expect(await outlineOf(page, ids.route)).toEqual(EXPECTED);
  });

  test('draw.io clipboard content and pastes without a topic are left to draw.io', async ({
    drawio,
  }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    await page.evaluate((id) => window.mindmap.selectTopic(id), ids.route);
    await paste(page, { 'text/plain': '<mxGraphModel><root></root></mxGraphModel>' });
    expect(await outlineOf(page, ids.route)).toEqual(EXPECTED);

    await page.evaluate(() => window.mindmapDebug.graph.clearSelection());
    await paste(page, { 'text/plain': 'Loose text' });
    expect(await outlineOf(page, ids.route)).toEqual(EXPECTED);
  });
});

test('broken files give clear errors', async ({ drawio }) => {
  const { page } = drawio;
  const errors = await page.evaluate(() =>
    [
      ['<map/>', 'freemind'],
      ['<opml><body>', 'opml'],
      ['   \n  ', 'markdown'],
    ].map(([text, format]) => {
      try {
        window.mindmap.importText(text, { format });
        return null;
      } catch (e) {
        return e.message;
      }
    }),
  );
  expect(errors[0]).toBe('The FreeMind file has no nodes.');
  expect(errors[1]).toMatch(/^Not valid XML/);
  expect(errors[2]).toBe('The text contains no topics.');
});
