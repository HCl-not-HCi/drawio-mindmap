// M3: arrow-key navigation, plus release-checklist items that can be automated.
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';

async function buildMap(page) {
  return page.evaluate(() => {
    const m = window.mindmap;
    const root = m.createMindmap({ label: 'Root', x: 400, y: 300 });
    const ids = { root };
    for (const name of ['A', 'B', 'C', 'D']) ids[name] = m.addChild(root, name); // A,C right; B,D left
    for (const name of ['A1', 'A2', 'A3']) ids[name] = m.addChild(ids.A, name);
    ids.B1 = m.addChild(ids.B, 'B1');
    m.selectTopic(root);
    return ids;
  });
}

const selectedLabel = (page) =>
  page.evaluate(() => {
    const [id] = window.mindmap.getSelectedTopics();
    const root = window.mindmap.listMindmaps()[0].id;
    const find = (n) => (n.id === id ? n : n.children.map(find).find(Boolean));
    return find(window.mindmap.getMindmap(root))?.label ?? null;
  });

test('arrow keys move the selection through the map', async ({ drawio }) => {
  const { page } = drawio;
  await buildMap(page);
  const steps = [
    ['ArrowRight', 'A'],
    ['ArrowRight', 'A2'], // closest child vertically
    ['ArrowDown', 'A3'],
    ['ArrowDown', 'A3'], // last sibling: stays
    ['ArrowUp', 'A2'],
    ['ArrowLeft', 'A'],
    ['ArrowDown', 'C'], // next first-level topic on the same side
    ['ArrowLeft', 'Root'],
    ['ArrowLeft', 'B'],
    ['ArrowLeft', 'B1'],
    ['ArrowRight', 'B'],
    ['ArrowRight', 'Root'],
  ];
  for (const [key, expected] of steps) {
    await page.keyboard.press(key);
    expect(await selectedLabel(page), `${key} → ${expected}`).toBe(expected);
  }
});

test('arrow keys do not move topics', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const geo = () =>
    page.evaluate((id) => {
      const model = window.mindmapDebug.graph.getModel();
      const g = model.getGeometry(model.getCell(id));
      return [g.x, g.y];
    }, ids.A1);
  const before = await geo();
  await page.evaluate((id) => window.mindmap.selectTopic(id), ids.A1);
  await page.keyboard.press('ArrowRight'); // leaf: nothing to the right
  expect(await geo()).toEqual(before);
  expect(await selectedLabel(page)).toBe('A1');
});

test('copy and paste of a whole map gives a second, independent map', async ({ drawio }) => {
  const { page } = drawio;
  await buildMap(page);
  await page.evaluate(() => {
    const { ui, graph } = window.mindmapDebug;
    graph.selectAll();
    ui.actions.get('copy').funct();
    ui.actions.get('paste').funct(); // asynchronous (clipboard API)
  });
  await page.waitForFunction(() => window.mindmap.listMindmaps().length === 2);
  const result = await page.evaluate(() =>
    window.mindmap.listMindmaps().map((m) => window.mindmap.getMindmap(m.id)),
  );
  expect(result).toHaveLength(2);
  const shape = (n) => [n.label, n.children.map(shape)];
  expect(shape(result[1])).toEqual(shape(result[0]));
  expect(result[1].id).not.toBe(result[0].id);

  // The pasted map can be edited with the plugin like the original.
  const added = await page.evaluate(
    (rootId) => window.mindmap.addChild(rootId, 'New'),
    result[1].id,
  );
  expect(added).toBeTruthy();
});

test('a saved mindmap opens and renders in draw.io without the plugin', async ({ page }) => {
  const xml = readFileSync(new URL('../../samples/basic.drawio', import.meta.url), 'utf8');
  // Load draw.io without ?p=mindmap and open the sample through a #R (raw) hash.
  await page.goto('/?splash=0');
  await page.waitForFunction(() => typeof window.Graph?.compress === 'function');
  const hash = await page.evaluate((x) => encodeURIComponent(window.Graph.compress(x)), xml);
  await page.goto(`/?splash=0#R${hash}`);

  const canvas = page.locator('.geDiagramContainer svg');
  for (const label of ['Trip planning', 'Packing', 'Sleeping bag', 'Day 2: Mountains']) {
    await expect(canvas.getByText(label, { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => window.mindmap)).toBeUndefined();
  await page.screenshot({ path: 'test-results/without-plugin.png' });
});
