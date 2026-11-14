// M4: drag to reparent/reorder, moveTopic, and branch colors following a move.
import { test, expect } from './fixtures.js';

async function buildMap(page) {
  return page.evaluate(() => {
    const m = window.mindmap;
    const root = m.createMindmap({ label: 'Root', x: 400, y: 300 });
    const ids = { root };
    for (const name of ['A', 'B', 'C', 'D']) ids[name] = m.addChild(root, name); // A,C right; B,D left
    for (const name of ['A1', 'A2']) ids[name] = m.addChild(ids.A, name);
    window.mindmapDebug.graph.clearSelection();
    return ids;
  });
}

const outline = (page) =>
  page.evaluate(() => {
    const strip = (n) => (n.children.length ? [n.label, n.children.map(strip)] : n.label);
    return strip(window.mindmap.getMindmap());
  });

const styleOf = (page, id) =>
  page.evaluate((cellId) => window.mindmapDebug.graph.getModel().getCell(cellId).style, id);

/** Centre of a cell in page coordinates. */
const centerOf = (page, id) =>
  page.evaluate((cellId) => {
    const { graph } = window.mindmapDebug;
    const state = graph.view.getState(graph.getModel().getCell(cellId));
    const rect = graph.container.getBoundingClientRect();
    return {
      x: rect.left + state.getCenterX() - graph.container.scrollLeft,
      y: rect.top + state.getCenterY() - graph.container.scrollTop,
    };
  }, id);

async function drag(page, id, to) {
  const from = await centerOf(page, id);
  const target = typeof to === 'string' ? await centerOf(page, to) : to(from);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + target.x) / 2, (from.y + target.y) / 2, { steps: 5 });
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
}

test('dragging a topic onto another makes it a child, as one undo step', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const before = await outline(page);

  await drag(page, ids.C, ids.A1);
  expect(await outline(page)).toEqual(['Root', [['A', [['A1', ['C']], 'A2']], 'B', 'D']]);

  await page.evaluate(() => window.mindmapDebug.ui.actions.get('undo').funct());
  expect(await outline(page)).toEqual(before);
});

test('dragging between siblings reorders them', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  // Onto the top quarter of A1: insert before it (the middle would make A2 its child).
  const a1 = await page.evaluate((id) => {
    const { graph } = window.mindmapDebug;
    return graph.view.getState(graph.getModel().getCell(id)).height;
  }, ids.A1);
  const top = await centerOf(page, ids.A1);
  await drag(page, ids.A2, (from) => ({ x: from.x, y: top.y - a1 / 2 + 3 }));
  expect(await outline(page)).toEqual(['Root', [['A', ['A2', 'A1']], 'B', 'C', 'D']]);
});

test('dragging a branch across the root switches its side', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const root = await centerOf(page, ids.root);
  const c = await centerOf(page, ids.C);
  await drag(page, ids.C, () => ({ x: root.x - (c.x - root.x), y: c.y }));
  expect(await styleOf(page, ids.C)).toContain('mmSide=left;');
});

test('dropping in empty space puts the topic back', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const geometry = () =>
    page.evaluate((id) => {
      const model = window.mindmapDebug.graph.getModel();
      const g = model.getGeometry(model.getCell(id));
      return [g.x, g.y];
    }, ids.A1);
  const before = await geometry();
  const outlineBefore = await outline(page);
  await drag(page, ids.A1, (from) => ({ x: from.x + 400, y: from.y + 250 }));
  expect(await geometry()).toEqual(before);
  expect(await outline(page)).toEqual(outlineBefore);
});

test('moved topics take the colors of their new branch; manual tweaks survive otherwise', async ({
  drawio,
}) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const strokeOf = async (id) => /strokeColor=([^;]+)/.exec(await styleOf(page, id))[1];
  expect(await strokeOf(ids.A1)).toBe(await strokeOf(ids.A));

  // A manual change is kept through unrelated edits...
  await page.evaluate((id) => {
    const { graph } = window.mindmapDebug;
    graph.setCellStyles('fillColor', '#ffff00', [graph.getModel().getCell(id)]);
  }, ids.A1);
  await page.evaluate((id) => window.mindmap.addSibling(id, 'A1b'), ids.A1);
  expect(await styleOf(page, ids.A1)).toContain('fillColor=#ffff00');

  // ...until the topic moves to another branch.
  await page.evaluate((i) => window.mindmap.moveTopic(i.A1, i.B), ids);
  expect(await strokeOf(ids.A1)).toBe(await strokeOf(ids.B));
  expect(await styleOf(page, ids.A1)).not.toContain('fillColor=#ffff00');
});

test('moveTopic validates its arguments', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const errors = await page.evaluate((i) => {
    const attempt = (fn) => {
      try {
        fn();
        return null;
      } catch (e) {
        return e.message;
      }
    };
    const m = window.mindmap;
    return [
      attempt(() => m.moveTopic(i.root, i.A)),
      attempt(() => m.moveTopic(i.A, i.A1)),
      attempt(() => m.moveTopic(i.A1, i.root, { beforeId: i.A2 })),
      attempt(() => m.moveTopic(i.A1, 'nope')),
    ];
  }, ids);
  expect(errors).toEqual([
    `Cannot move a central topic: ${ids.root}`,
    `Cannot move a topic into its own subtree: ${ids.A}`,
    `Not a child of ${ids.root}: ${ids.A2}`,
    'Unknown topic: nope',
  ]);
});

test('moveTopic to the first level sets a side and a branch color', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  await page.evaluate((i) => window.mindmap.moveTopic(i.A1, i.root, { side: 'left' }), ids);
  const style = await styleOf(page, ids.A1);
  expect(style).toContain('mmSide=left;');
  expect(style).toMatch(/mmBranch=4;/); // A-D use 0-3
});
