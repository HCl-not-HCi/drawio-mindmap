// M2: automatic layout, sizing, connectors, and undo including layout.
import { test, expect } from './fixtures.js';

/** Geometry of all topics plus their parent and side, read in the page. */
const readTopics = (page) =>
  page.evaluate(() => {
    const { graph } = window.mindmapDebug;
    const model = graph.getModel();
    const out = {};
    const visit = (node, parent, side) => {
      const cell = model.getCell(node.id);
      const g = model.getGeometry(cell);
      const s = side ?? (/mmSide=(left|right)/.exec(cell.style)?.[1] || null);
      out[node.id] = {
        label: node.label,
        parent,
        side: s,
        x: g.x,
        y: g.y,
        w: g.width,
        h: g.height,
      };
      node.children.forEach((c) => visit(c, node.id, parent == null ? null : s));
    };
    for (const { id } of window.mindmap.listMindmaps()) visit(window.mindmap.getMindmap(id), null);
    return out;
  });

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Asserts no overlaps and children outside their parents (collects, then asserts once). */
function expectTidy(topics) {
  const problems = [];
  const list = Object.values(topics);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (overlaps(list[i], list[j])) problems.push(`overlap: ${list[i].label} / ${list[j].label}`);
    }
  }
  for (const t of list) {
    if (t.parent == null) continue;
    const p = topics[t.parent];
    const outside = t.side === 'right' ? t.x > p.x + p.w : t.x + t.w < p.x;
    if (!outside) problems.push(`not outside parent: ${t.label}`);
  }
  expect(problems).toEqual([]);
}

async function buildMap(page) {
  return page.evaluate(() => {
    const m = window.mindmap;
    const root = m.createMindmap({ label: 'Root', x: 400, y: 300 });
    const ids = { root };
    for (const name of ['A', 'B', 'C', 'D']) ids[name] = m.addChild(root, name);
    for (const name of ['A1', 'A2', 'A3']) ids[name] = m.addChild(ids.A, name);
    ids.B1 = m.addChild(ids.B, 'B1');
    ids.B11 = m.addChild(ids.B1, 'B11');
    return ids;
  });
}

test('maps are laid out tidily on both sides of the root', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const topics = await readTopics(page);
  expectTidy(topics);

  // Balanced: first-level topics alternate by height; the root stays where it was put.
  expect(
    Object.values(topics).filter((t) => t.parent === ids.root && t.side === 'right'),
  ).toHaveLength(2);
  expect(topics[ids.root]).toMatchObject({ x: 400, y: 300 });

  // Parents are vertically centred on their children.
  const mid = (t) => t.y + t.h / 2;
  expect(mid(topics[ids.A])).toBeCloseTo((mid(topics[ids.A1]) + mid(topics[ids.A3])) / 2, 0);
});

test('topics fit their labels and long labels wrap', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const before = await readTopics(page);
  await page.evaluate(
    (id) =>
      window.mindmap.renameTopic(
        id,
        'A very long label that is certainly wider than the maximum topic width',
      ),
    ids.A2,
  );
  const after = await readTopics(page);
  expect(after[ids.A2].w).toBe(220);
  expect(after[ids.A2].h).toBeGreaterThan(before[ids.A2].h);
  expect(after[ids.A1].w).toBeLessThan(100);
  expectTidy(after);
});

test('typing a label re-lays out the map', async ({ drawio }) => {
  const { page } = drawio;
  await page.keyboard.press('Alt+Shift+M');
  await page.keyboard.type('Root');
  for (const label of ['One', 'Two', 'Three']) {
    await page.keyboard.press('Tab');
    await page.keyboard.type(`${label} with quite a long label to grow the topic`);
    await page.keyboard.press('Enter');
    await page.evaluate(() => {
      const root = window.mindmap.listMindmaps()[0].id;
      window.mindmap.selectTopic(root);
    });
  }
  expectTidy(await readTopics(page));
});

test('a change and its layout are one undo step', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const before = await readTopics(page);
  const undo = () => page.evaluate(() => window.mindmapDebug.ui.actions.get('undo').funct());
  const redo = () => page.evaluate(() => window.mindmapDebug.ui.actions.get('redo').funct());

  await page.evaluate((id) => window.mindmap.addSibling(id, 'A+'), ids.A1);
  const added = await readTopics(page);
  expect(added[ids.A3].y).toBeGreaterThan(before[ids.A3].y); // pushed down by the layout

  await undo();
  expect(await readTopics(page)).toEqual(before);
  await redo();
  expect(await readTopics(page)).toEqual(added);
});

test('deleting a subtree closes the gap', async ({ drawio }) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const before = await readTopics(page);
  await page.evaluate((id) => window.mindmap.deleteTopic(id), ids.A2);
  const after = await readTopics(page);
  expect(after[ids.A3].y).toBeLessThan(before[ids.A3].y);
  expectTidy(after);
});

test('the layout wins over manually moved topics; moving the root moves the map', async ({
  drawio,
}) => {
  const { page } = drawio;
  const ids = await buildMap(page);
  const before = await readTopics(page);
  const move = (id, dx, dy) =>
    page.evaluate(
      ([cellId, dx, dy]) => {
        const { graph } = window.mindmapDebug;
        graph.moveCells([graph.getModel().getCell(cellId)], dx, dy);
      },
      [id, dx, dy],
    );

  await move(ids.A1, 600, 400); // far from any topic: no reparent, just snaps back
  expect(await readTopics(page)).toEqual(before);

  await move(ids.root, 100, 50);
  const after = await readTopics(page);
  for (const id of Object.keys(before)) {
    expect(after[id].x).toBeCloseTo(before[id].x + 100, 0);
    expect(after[id].y).toBeCloseTo(before[id].y + 50, 0);
  }
});

test('tree edges are curved and have no waypoints', async ({ drawio }) => {
  const { page } = drawio;
  await buildMap(page);
  const edges = await page.evaluate(() => {
    const model = window.mindmapDebug.graph.getModel();
    return Object.values(model.cells)
      .filter((c) => model.isEdge(c))
      .map((c) => ({ style: c.style, points: model.getGeometry(c).points?.length ?? 0 }));
  });
  expect(edges).toHaveLength(9);
  for (const e of edges) {
    expect(e.style).toContain('edgeStyle=entityRelationEdgeStyle;curved=1;');
    expect(e.points).toBe(0);
  }
});

test('opening a diagram does not re-layout or modify it', async ({ drawio }) => {
  const { page } = drawio;
  const result = await page.evaluate(() => {
    const { ui } = window.mindmapDebug;
    // A hand-placed map: positions the layout would change.
    const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="r" value="R" style="ellipse;html=1;mindmap=1;mmRole=root;" vertex="1" parent="1">
        <mxGeometry x="10" y="10" width="160" height="60" as="geometry"/></mxCell>
      <mxCell id="a" value="A" style="rounded=1;html=1;mindmap=1;mmRole=topic;mmOrder=0;" vertex="1" parent="1">
        <mxGeometry x="500" y="400" width="120" height="36" as="geometry"/></mxCell>
      <mxCell id="e" style="mmEdge=1;" edge="1" parent="1" source="r" target="a">
        <mxGeometry relative="1" as="geometry"/></mxCell>
      </root></mxGraphModel>`;
    ui.editor.setGraphXml(window.mxUtils.parseXml(xml).documentElement);
    const g = ui.editor.graph.getModel().getGeometry(ui.editor.graph.getModel().getCell('a'));
    return {
      x: g.x,
      y: g.y,
      style: ui.editor.graph.getModel().getStyle(ui.editor.graph.getModel().getCell('e')),
    };
  });
  expect(result).toEqual({ x: 500, y: 400, style: 'mmEdge=1;' });

  // The first edit to that map lays it out.
  await page.evaluate(() => window.mindmap.addChild('r', 'B'));
  const topics = await readTopics(page);
  expect(topics.a.x).not.toBe(500);
  expectTidy(topics);
});

test('a map with 300 topics stays responsive', async ({ drawio }) => {
  const { page } = drawio;
  test.setTimeout(120_000);
  const timings = await page.evaluate(() => {
    const m = window.mindmap;
    const { graph } = window.mindmapDebug;
    const root = m.createMindmap({ label: 'Big' });
    // Build in one transaction (one layout) to keep the test fast.
    graph.getModel().beginUpdate();
    try {
      for (let i = 0; i < 10; i++) {
        const a = m.addChild(root, `Branch ${i}`);
        for (let j = 0; j < 5; j++) {
          const b = m.addChild(a, `Topic ${i}.${j}`);
          for (let k = 0; k < 5; k++) m.addChild(b, `Leaf ${i}.${j}.${k}`);
        }
      }
    } finally {
      graph.getModel().endUpdate();
    }
    const branch = m.getMindmap(root).children[4].children[2].id;
    const samples = [];
    for (let n = 0; n < 5; n++) {
      const start = performance.now();
      m.addChild(branch, `New ${n}`);
      samples.push(performance.now() - start);
    }
    return { topics: Object.keys(graph.getModel().cells).length, samples };
  });
  expect(timings.topics).toBeGreaterThan(600); // ~300 topics + ~300 edges
  const median = timings.samples.sort((a, b) => a - b)[2];
  console.log(`addChild on a 300-topic map: median ${median.toFixed(1)} ms`, timings.samples);
  expect(median).toBeLessThan(250);
  expectTidy(await readTopics(page));
});
