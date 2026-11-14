// M4: converting hand-drawn shapes and connectors into a managed mindmap.
import { test, expect, clickMindmapMenuItem } from './fixtures.js';

/** Draws a small tree by hand: centre, two right branches, one left, one reversed edge. */
const drawShapes = (page) =>
  page.evaluate(() => {
    const { graph } = window.mindmapDebug;
    const parent = graph.getDefaultParent();
    const v = (id, label, x, y) =>
      graph.insertVertex(parent, id, label, x, y, 90, 40, 'shape=hexagon;fillColor=#eeeeee;');
    graph.getModel().beginUpdate();
    try {
      const c = v('c', 'Centre', 300, 200);
      const r1 = v('r1', 'Right 1', 520, 120);
      const r2 = v('r2', 'Right 2', 520, 300);
      const l1 = v('l1', 'Left 1', 60, 200);
      const r1a = v('r1a', 'Right 1a', 720, 100);
      graph.insertEdge(parent, 'e1', '', c, r1);
      graph.insertEdge(parent, 'e2', '', c, r2);
      graph.insertEdge(parent, 'e3', '', l1, c); // drawn towards the centre
      graph.insertEdge(parent, 'e4', '', r1, r1a);
      graph.selectAll();
    } finally {
      graph.getModel().endUpdate();
    }
  });

test('Convert Selection to Mindmap adopts a hand-drawn tree in one undo step', async ({
  drawio,
}) => {
  const { page } = drawio;
  await drawShapes(page);
  await clickMindmapMenuItem(page, 'Convert Selection to Mindmap');

  const result = await page.evaluate(() => {
    const model = window.mindmapDebug.graph.getModel();
    const strip = (n) => (n.children.length ? [n.label, n.children.map(strip)] : n.label);
    return {
      outline: strip(window.mindmap.getMindmap()),
      selected: window.mindmap.getSelectedTopics(),
      l1Side: /mmSide=(\w+)/.exec(model.getCell('l1').style)?.[1],
      e3Source: model.getTerminal(model.getCell('e3'), true).id,
      hexagon: model.getCell('r1').style.startsWith('shape=hexagon;'),
    };
  });
  expect(result).toEqual({
    outline: ['Centre', [['Right 1', ['Right 1a']], 'Left 1', 'Right 2']],
    selected: ['c'],
    l1Side: 'left',
    e3Source: 'c', // flipped to point away from the centre
    hexagon: true, // shapes keep their look
  });

  // From now on it behaves like any mindmap: keyboard editing works...
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.mindmap.getMindmap().children.length)).toBe(4);

  // ...and the conversion itself is undone in one step (after undoing the Tab).
  await page.evaluate(() => {
    const undo = window.mindmapDebug.ui.actions.get('undo');
    undo.funct();
    undo.funct();
  });
  expect(await page.evaluate(() => window.mindmap.listMindmaps())).toEqual([]);
});

test('converting a disconnected selection explains the problem', async ({ drawio }) => {
  const { page } = drawio;
  await page.evaluate(() => {
    const { graph } = window.mindmapDebug;
    const parent = graph.getDefaultParent();
    graph.insertVertex(parent, null, 'A', 0, 0, 80, 30);
    graph.insertVertex(parent, null, 'B', 200, 0, 80, 30);
    graph.selectAll();
  });
  await clickMindmapMenuItem(page, 'Convert Selection to Mindmap');
  await expect(page.locator('.geDialog')).toContainText('one connected tree');
});
