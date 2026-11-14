// M6: an MCP client drives the mindmap open in draw.io through the real MCP server.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { test, expect } from './fixtures.js';

const TOKEN = 'e2e-bridge-token-0123456789';

let client;

test.beforeAll(async () => {
  client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['packages/mcp-server/dist/cli.js'],
      env: { ...process.env, MINDMAP_BRIDGE_TOKEN: TOKEN, MINDMAP_BRIDGE_PORT: '47100' },
      stderr: 'pipe',
    }),
  );
});

test.afterAll(async () => {
  await client?.close();
});

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content[0]?.text ?? '';
  if (result.isError) return { error: text };
  return JSON.parse(text);
}

async function connect(page, token = TOKEN) {
  await page.evaluate((t) => {
    window.mindmapDebug.bridge.setToken(t);
    window.mindmapDebug.bridge.enable();
  }, token);
}

const outline = (page) =>
  page.evaluate(() => {
    const strip = (n) => (n.children.length ? [n.label, n.children.map(strip)] : n.label);
    return strip(window.mindmap.getMindmap());
  });

test('an MCP client builds and edits the open map, one undo step per call', async ({ drawio }) => {
  const { page } = drawio;
  await connect(page);
  await expect(page.locator('.mindmapLlmStatus')).toHaveAttribute('data-state', 'connected');
  expect(await call('list_windows')).toEqual([
    expect.objectContaining({ window_id: expect.any(String) }),
  ]);

  // No map yet: the tool explains how to create one.
  expect((await call('get_mindmap')).error).toMatch(/no mindmap on the current page/);

  const [rootId] = await call('insert_outline', { markdown: '# Garden\n- Vegetables\n- Flowers' });
  const map = await call('get_mindmap');
  expect(map).toMatchObject({ id: rootId, label: 'Garden' });
  const vegetables = map.children[0].id;

  const ids = await call('add_topics', { parent_id: vegetables, labels: ['Beans', 'Kale'] });
  expect(ids).toHaveLength(2);
  expect(await outline(page)).toEqual(['Garden', [['Vegetables', ['Beans', 'Kale']], 'Flowers']]);

  // Each call is one undo step for the user.
  await page.evaluate(() => window.mindmapDebug.ui.actions.get('undo').funct());
  expect(await outline(page)).toEqual(['Garden', ['Vegetables', 'Flowers']]);
  await page.evaluate(() => window.mindmapDebug.ui.actions.get('redo').funct());

  await call('rename_topic', { topic_id: ids[1], label: 'Curly kale' });
  await call('move_topic', { topic_id: ids[0], new_parent_id: map.children[1].id });
  await call('insert_outline', { parent_id: rootId, markdown: '- Tools\n  - Spade\n  - Hose' });
  expect(await outline(page)).toEqual([
    'Garden',
    [
      ['Vegetables', ['Curly kale']],
      ['Flowers', ['Beans']],
      ['Tools', ['Spade', 'Hose']],
    ],
  ]);

  // The selection gives the LLM context ("add ideas under this").
  await page.evaluate((id) => window.mindmap.selectTopic(id), map.children[1].id);
  expect(await call('get_selection')).toEqual([{ id: map.children[1].id, label: 'Flowers' }]);

  await call('delete_topic', { topic_id: ids[0] });
  expect(await outline(page)).toEqual([
    'Garden',
    [['Vegetables', ['Curly kale']], 'Flowers', ['Tools', ['Spade', 'Hose']]],
  ]);

  // Errors come back as tool errors and change nothing.
  expect((await call('rename_topic', { topic_id: 'nope', label: 'x' })).error).toBe(
    'Unknown topic: nope',
  );
});

test('turning the toggle off cuts the LLM off', async ({ drawio }) => {
  const { page } = drawio;
  await connect(page);
  await expect(page.locator('.mindmapLlmStatus')).toHaveAttribute('data-state', 'connected');
  await page.locator('.mindmapLlmStatus').click();
  await expect(page.locator('.mindmapLlmStatus')).toHaveAttribute('data-state', 'off');
  await expect
    .poll(async () => (await call('get_selection')).error ?? '')
    .toMatch(/No draw.io window is connected/);
});

test('a wrong token is rejected and shown in the indicator', async ({ drawio }) => {
  const { page } = drawio;
  await connect(page, 'wrong-token-0123456789');
  await expect(page.locator('.mindmapLlmStatus')).toHaveAttribute('data-state', 'error');
  expect(await page.locator('.mindmapLlmStatus').getAttribute('title')).toMatch(/rejected/);
  expect((await call('get_selection')).error).toMatch(/No draw.io window is connected/);
});

test('the CSP only lets the page connect to the bridge port', async ({ drawio }) => {
  const { page, consoleMessages } = drawio;
  await page.evaluate(() => {
    try {
      new WebSocket('ws://127.0.0.1:47101');
    } catch {
      // some browsers throw synchronously
    }
  });
  await expect
    .poll(() => consoleMessages.some((m) => /Content Security Policy/i.test(m.text)))
    .toBe(true);
});
