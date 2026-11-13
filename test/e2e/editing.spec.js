// M1: create a mindmap and edit its structure with the keyboard and the public API.
import { test, expect, clickMindmapMenuItem } from './fixtures.js';

/** Outline as nested [label, [children...]] for compact assertions. */
async function outline(page, topicId) {
  return page.evaluate((id) => {
    const strip = (n) => (n.children.length ? [n.label, n.children.map(strip)] : n.label);
    return strip(window.mindmap.getMindmap(id ?? undefined));
  }, topicId ?? null);
}

const isEditing = (page) => page.evaluate(() => window.mindmapDebug.graph.isEditing());
const selected = (page) => page.evaluate(() => window.mindmap.getSelectedTopics());
const cellCount = (page) =>
  page.evaluate(() => Object.keys(window.mindmapDebug.graph.getModel().cells).length);

test.describe('creating a mindmap', () => {
  test('Extras → Mindmap → New creates a root and starts editing it', async ({ drawio }) => {
    const { page } = drawio;
    await clickMindmapMenuItem(page, 'New Mindmap');
    expect(await isEditing(page)).toBe(true);
    await page.keyboard.type('Ideas');
    await page.keyboard.press('Escape');

    expect(await isEditing(page)).toBe(false);
    expect(await outline(page)).toBe('Ideas');
    const [rootId] = await selected(page);
    expect(await page.evaluate(() => window.mindmap.listMindmaps())).toEqual([
      { id: rootId, label: 'Ideas' },
    ]);
  });

  test('Alt+Shift+M creates a mindmap', async ({ drawio }) => {
    const { page } = drawio;
    await page.keyboard.press('Alt+Shift+M');
    expect(await isEditing(page)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await outline(page)).toBe('Central Topic');
  });
});

test.describe('keyboard editing', () => {
  test('Tab, Enter and typing build a tree', async ({ drawio }) => {
    const { page } = drawio;
    await page.keyboard.press('Alt+Shift+M');
    await page.keyboard.type('Trip');
    await page.keyboard.press('Enter'); // finishes editing
    expect(await isEditing(page)).toBe(false);

    await page.keyboard.press('Enter'); // on the root: adds a child
    await page.keyboard.type('Packing');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab'); // child of Packing
    await page.keyboard.type('Tent');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // sibling of Tent
    await page.keyboard.type('Stove');
    await page.keyboard.press('Escape');

    await page.evaluate(() => {
      const root = window.mindmap.listMindmaps()[0].id;
      window.mindmap.selectTopic(window.mindmap.getMindmap(root).children[0].id);
    });
    await page.keyboard.press('Enter'); // sibling of Packing
    await page.keyboard.type('Route');
    await page.keyboard.press('Escape');

    expect(await outline(page)).toEqual(['Trip', [['Packing', ['Tent', 'Stove']], 'Route']]);
  });

  test('Tab while editing finishes the label and adds a child', async ({ drawio }) => {
    const { page } = drawio;
    await page.keyboard.press('Alt+Shift+M');
    await page.keyboard.type('Root');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Child');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Grandchild');
    await page.keyboard.press('Escape');
    expect(await outline(page)).toEqual(['Root', [['Child', ['Grandchild']]]]);
  });

  test('Shift+Enter inserts a line break while editing', async ({ drawio }) => {
    const { page } = drawio;
    await page.keyboard.press('Alt+Shift+M');
    await page.keyboard.type('Line 1');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Line 2');
    await page.keyboard.press('Enter');
    expect(await outline(page)).toBe('Line 1\nLine 2');
  });

  test('F2 and typing start editing a selected topic', async ({ drawio }) => {
    const { page } = drawio;
    const rootId = await page.evaluate(() => {
      const id = window.mindmap.createMindmap({ label: 'Old' });
      window.mindmap.selectTopic(id);
      return id;
    });
    await page.keyboard.press('F2');
    expect(await isEditing(page)).toBe(true);
    await page.keyboard.press('Escape');

    await page.keyboard.type('New');
    expect(await isEditing(page)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await outline(page)).toBe('New');
    expect(await selected(page)).toEqual([rootId]);
  });

  test('Delete and Backspace remove the subtree and select the parent', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await page.evaluate(() => {
      const m = window.mindmap;
      const root = m.createMindmap({ label: 'R' });
      const a = m.addChild(root, 'A');
      m.addChild(a, 'A1');
      m.addChild(a, 'A2');
      const b = m.addChild(root, 'B');
      m.addChild(b, 'B1');
      return { root, a, b };
    });
    const before = await cellCount(page);

    await page.evaluate((id) => window.mindmap.selectTopic(id), ids.a);
    await page.keyboard.press('Delete');
    expect(await outline(page)).toEqual(['R', [['B', ['B1']]]]);
    expect(await selected(page)).toEqual([ids.root]);
    expect(await cellCount(page)).toBe(before - 6); // 3 topics + 3 edges

    await page.evaluate((id) => window.mindmap.selectTopic(id), ids.b);
    await page.keyboard.press('Backspace');
    expect(await outline(page)).toBe('R');
  });
});

test.describe('undo', () => {
  test('each command is a single undo step', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await page.evaluate(() => {
      const m = window.mindmap;
      const root = m.createMindmap({ label: 'R' });
      const a = m.addChild(root, 'A');
      const b = m.addChild(root, 'B');
      m.addChild(b, 'B1');
      return { root, a, b };
    });
    const undo = () => page.evaluate(() => window.mindmapDebug.ui.actions.get('undo').funct());

    // addSibling renumbers B; one undo must revert both the insert and the reorder.
    await page.evaluate((id) => window.mindmap.addSibling(id, 'A+'), ids.a);
    expect(await outline(page)).toEqual(['R', ['A', 'A+', ['B', ['B1']]]]);
    await undo();
    expect(await outline(page)).toEqual(['R', ['A', ['B', ['B1']]]]);

    await page.evaluate((id) => window.mindmap.deleteTopic(id), ids.b);
    await undo();
    expect(await outline(page)).toEqual(['R', ['A', ['B', ['B1']]]]);

    await page.evaluate((id) => window.mindmap.renameTopic(id, 'Renamed'), ids.a);
    await undo();
    expect(await outline(page)).toEqual(['R', ['A', ['B', ['B1']]]]);
  });

  test('Ctrl+Z after Tab removes the added topic', async ({ drawio }) => {
    const { page } = drawio;
    const rootId = await page.evaluate(() => {
      const id = window.mindmap.createMindmap({ label: 'R' });
      window.mindmap.selectTopic(id);
      return id;
    });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    expect(await outline(page)).toEqual(['R', ['Topic']]);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await outline(page, rootId)).toBe('R');
  });
});

test.describe('outside mindmaps', () => {
  test('Tab, Enter and Delete keep their draw.io behavior on normal shapes', async ({ drawio }) => {
    const { page } = drawio;
    await page.evaluate(() => {
      const graph = window.mindmapDebug.graph;
      const parent = graph.getDefaultParent();
      graph.getModel().beginUpdate();
      try {
        const a = graph.insertVertex(parent, 'plainA', 'A', 20, 20, 80, 30);
        graph.insertVertex(parent, 'plainB', 'B', 200, 20, 80, 30);
        graph.setSelectionCell(a);
      } finally {
        graph.getModel().endUpdate();
      }
    });
    const before = await cellCount(page);

    await page.keyboard.press('Tab'); // draw.io: select next cell
    expect(await page.evaluate(() => window.mindmapDebug.graph.getSelectionCell()?.id)).toBe(
      'plainB',
    );
    expect(await cellCount(page)).toBe(before);

    await page.keyboard.press('Enter'); // draw.io: start editing
    expect(await isEditing(page)).toBe(true);
    await page.keyboard.press('Escape');

    await page.keyboard.press('Delete');
    expect(await cellCount(page)).toBe(before - 1);
  });

  test('mixed selection of topics and shapes falls back to draw.io', async ({ drawio }) => {
    const { page } = drawio;
    await page.evaluate(() => {
      const graph = window.mindmapDebug.graph;
      const root = window.mindmap.createMindmap({ label: 'R' });
      const plain = graph.insertVertex(graph.getDefaultParent(), null, 'P', 0, 0, 40, 40);
      graph.setSelectionCells([graph.getModel().getCell(root), plain]);
    });
    const before = await cellCount(page);
    await page.keyboard.press('Tab');
    expect(await cellCount(page)).toBe(before);
  });
});

test.describe('public API', () => {
  test('labels with markup characters round-trip as plain text', async ({ drawio }) => {
    const { page } = drawio;
    const label = 'a < b && "c" \'d\'\nsecond <b>line</b>';
    const result = await page.evaluate((text) => {
      const root = window.mindmap.createMindmap({ label: 'R' });
      const id = window.mindmap.addChild(root, text);
      return window.mindmap.getMindmap(id).children[0].label;
    }, label);
    expect(result).toBe(label);
  });

  test('unknown ids throw clear errors and change nothing', async ({ drawio }) => {
    const { page } = drawio;
    const before = await cellCount(page);
    const errors = await page.evaluate(() =>
      ['addChild', 'addSibling', 'deleteTopic', 'renameTopic', 'selectTopic'].map((name) => {
        try {
          window.mindmap[name]('nope', 'x');
          return null;
        } catch (e) {
          return e.message;
        }
      }),
    );
    expect(errors).toEqual(Array(5).fill('Unknown topic: nope'));
    expect(await cellCount(page)).toBe(before);
  });
});

test.describe('file format', () => {
  test('saved XML holds plain cells with the mindmap style keys', async ({ drawio }) => {
    const { page } = drawio;
    const xml = await page.evaluate(() => {
      const m = window.mindmap;
      const root = m.createMindmap({ label: 'R' });
      m.addChild(root, 'A');
      const { ui } = window.mindmapDebug;
      return window.mxUtils.getXml(ui.editor.getGraphXml());
    });
    const cells = [...xml.matchAll(/<mxCell ([^>]*?)\/?>/g)].map((m) =>
      Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
    );
    const root = cells.find((c) => c.value === 'R');
    const topic = cells.find((c) => c.value === 'A');
    const edge = cells.find((c) => c.edge === '1');
    expect(root.style).toContain('mindmap=1;mmRole=root;');
    expect(topic.style).toContain('mindmap=1;mmRole=topic;mmOrder=0;');
    expect(edge).toMatchObject({ source: root.id, target: topic.id });
    expect(edge.style).toContain('mmEdge=1;');
  });
});
