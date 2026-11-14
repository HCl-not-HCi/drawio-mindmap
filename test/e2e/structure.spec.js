// M4: collapse/expand, side control and layout options.
import { test, expect, clickMindmapMenuItem } from './fixtures.js';

async function buildMap(page) {
  return page.evaluate(() => {
    const m = window.mindmap;
    const root = m.createMindmap({ label: 'Root', x: 400, y: 300 });
    const ids = { root };
    for (const name of ['A', 'B', 'C', 'D']) ids[name] = m.addChild(root, name); // A,C right; B,D left
    for (const name of ['A1', 'A2']) ids[name] = m.addChild(ids.A, name);
    ids.A11 = m.addChild(ids.A1, 'A11');
    m.selectTopic(ids.A);
    return ids;
  });
}

const state = (page, id) =>
  page.evaluate((cellId) => {
    const model = window.mindmapDebug.graph.getModel();
    const cell = model.getCell(cellId);
    const g = model.getGeometry(cell);
    return {
      x: g.x,
      y: g.y,
      visible: model.isVisible(cell),
      collapsed: model.isCollapsed(cell),
      side: /mmSide=(\w+)/.exec(cell.style)?.[1] ?? null,
    };
  }, id);

const undo = (page) => page.evaluate(() => window.mindmapDebug.ui.actions.get('undo').funct());

test.describe('collapse and expand', () => {
  test('Ctrl+. hides the subtree, relayouts, and is one undo step', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    const cBefore = await state(page, ids.C);

    await page.keyboard.press('ControlOrMeta+Period');
    expect(await state(page, ids.A)).toMatchObject({ collapsed: true, visible: true });
    expect(await state(page, ids.A1)).toMatchObject({ visible: false });
    expect(await state(page, ids.A11)).toMatchObject({ visible: false });
    // C moves up: A's block shrank to A's own height.
    expect((await state(page, ids.C)).y).toBeLessThan(cBefore.y);
    const outline = await page.evaluate(() => window.mindmap.getMindmap().children[0]);
    expect(outline).toMatchObject({ label: 'A', collapsed: true });

    await undo(page);
    expect(await state(page, ids.A)).toMatchObject({ collapsed: false });
    expect(await state(page, ids.A1)).toMatchObject({ visible: true });
    expect(await state(page, ids.C)).toEqual(cBefore);
  });

  test('expanding restores nested collapsed state; navigation skips hidden topics', async ({
    drawio,
  }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    await page.evaluate((i) => {
      window.mindmap.setCollapsed([i.A1], true);
      window.mindmap.setCollapsed([i.A], true);
      window.mindmap.setCollapsed([i.A], false);
    }, ids);
    expect(await state(page, ids.A1)).toMatchObject({ visible: true, collapsed: true });
    expect(await state(page, ids.A11)).toMatchObject({ visible: false });

    await page.evaluate((id) => window.mindmap.selectTopic(id), ids.A1);
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => window.mindmap.getSelectedTopics())).toEqual([ids.A1]);
  });

  test('adding a child to a collapsed topic expands it', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    await page.keyboard.press('ControlOrMeta+Period');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    expect(await state(page, ids.A)).toMatchObject({ collapsed: false });
    expect(await state(page, ids.A1)).toMatchObject({ visible: true });
  });

  test('only topics with children get the fold toggle', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    const folding = await page.evaluate((i) => {
      const model = window.mindmapDebug.graph.getModel();
      return [i.A, i.A2, i.root].map((id) => /treeFolding=1/.test(model.getCell(id).style));
    }, ids);
    expect(folding).toEqual([true, false, true]);
  });
});

test.describe('side control', () => {
  test('Ctrl+Left/Right moves the whole branch, from any topic in it', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    expect((await state(page, ids.A)).side).toBe('right');

    await page.evaluate((id) => window.mindmap.selectTopic(id), ids.A11);
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    const a = await state(page, ids.A);
    const root = await state(page, ids.root);
    expect(a.side).toBe('left');
    expect(a.x).toBeLessThan(root.x);
    expect((await state(page, ids.A11)).x).toBeLessThan(a.x);

    await page.keyboard.press('ControlOrMeta+ArrowRight');
    expect((await state(page, ids.A)).side).toBe('right');
  });
});

test.describe('layout options', () => {
  test('one-sided modes from the menu keep the stored sides', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    const rootX = (await state(page, ids.root)).x;

    await clickMindmapMenuItem(page, 'Layout');
    await page.getByRole('menuitem', { name: 'Right Only' }).click();
    for (const id of [ids.A, ids.B, ids.C, ids.D]) {
      expect((await state(page, id)).x).toBeGreaterThan(rootX);
    }
    expect((await state(page, ids.B)).side).toBe('left'); // stored side untouched

    await page.evaluate((id) => window.mindmap.setLayoutOptions(id, { mode: 'balanced' }), ids.A);
    expect((await state(page, ids.B)).x).toBeLessThan(rootX);
    expect(await page.evaluate((id) => window.mindmap.getLayoutOptions(id).mode, ids.A)).toBe(
      'balanced',
    );
  });

  test('spacing presets change the gaps and are stored on the root', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    const gap = async () => (await state(page, ids.A1)).x - (await state(page, ids.A)).x;
    const normal = await gap();

    await clickMindmapMenuItem(page, 'Layout');
    await page.getByRole('menuitem', { name: 'Wide Spacing' }).click();
    expect(await gap()).toBe(normal + 20);
    const rootStyle = await page.evaluate(
      (id) => window.mindmapDebug.graph.getModel().getCell(id).style,
      ids.root,
    );
    expect(rootStyle).toContain('mmRootGap=100;mmHGap=70;mmVGap=20;');
  });

  test('invalid options are rejected', async ({ drawio }) => {
    const { page } = drawio;
    const ids = await buildMap(page);
    const errors = await page.evaluate((id) => {
      const attempt = (fn) => {
        try {
          fn();
          return null;
        } catch (e) {
          return e.message;
        }
      };
      return [
        attempt(() => window.mindmap.setLayoutOptions(id, { mode: 'up' })),
        attempt(() => window.mindmap.setLayoutOptions(id, { spacing: { hGap: -5 } })),
        attempt(() => window.mindmap.setSide(id, 'top')),
      ];
    }, ids.A);
    expect(errors).toEqual([
      'Unknown layout mode: up',
      'Invalid spacing: hGap=-5',
      'Unknown side: top',
    ]);
  });
});
