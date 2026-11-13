// M0 spike: the plugin can reach a WebSocket server on 127.0.0.1 from inside draw.io,
// and the CSP (DRAWIO_CSP_HEADER in docker-compose.yml) is what allows it.
import { WebSocketServer } from 'ws';
import { test, expect, clickMindmapMenuItem } from './fixtures.js';

const ALLOWED_PORT = 47100; // listed in connect-src
const BLOCKED_PORT = 47101; // not listed in connect-src

function startEchoServer(port) {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port });
    wss.on('connection', (s) => s.on('message', (d) => s.send(d.toString())));
    wss.once('listening', () => resolve(wss));
    wss.once('error', reject);
  });
}

const check = (page, url) =>
  page.evaluate((u) => window.mindmap.spike.checkWebSocket({ url: u }), url);

test.describe('WebSocket spike', () => {
  let servers = [];
  test.beforeAll(async () => {
    servers = await Promise.all([startEchoServer(ALLOWED_PORT), startEchoServer(BLOCKED_PORT)]);
  });
  test.afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  });

  test('connects to the allowed localhost port and gets an echo', async ({ drawio }) => {
    const result = await check(drawio.page, `ws://127.0.0.1:${ALLOWED_PORT}`);
    expect(result).toMatchObject({ ok: true, detail: 'echo received' });
  });

  test('CSP blocks a port that is not in connect-src', async ({ drawio }) => {
    const result = await check(drawio.page, `ws://127.0.0.1:${BLOCKED_PORT}`);
    expect(result.ok).toBe(false);
    expect(drawio.consoleMessages.some((m) => /Content Security Policy/i.test(m.text))).toBe(true);
  });

  test('menu action reports the result in a dialog', async ({ drawio }) => {
    const { page } = drawio;
    await clickMindmapMenuItem(page, 'Test WebSocket connection...');
    await expect(page.locator('.geDialog')).toContainText(
      `WebSocket OK: ws://127.0.0.1:${ALLOWED_PORT}`,
    );
  });
});
