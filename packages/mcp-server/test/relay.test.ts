// Several MCP server processes on one machine: the first owns the port (hub), later ones
// relay through it, and a relay takes over when the hub goes away.
import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { CLOSE_PROTOCOL } from '../src/bridge.js';
import { BridgeLink } from '../src/link.js';

const TOKEN = 'relay-test-token-0123456789';
const ORIGIN = 'http://localhost:8080';

const links: BridgeLink[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.terminate());
  await Promise.all(links.splice(0).map((l) => l.stop()));
});

/** A port that is free right now. */
const freePort = () =>
  new Promise<number>((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });

async function startLink(port: number) {
  const link = new BridgeLink({
    port,
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    requestTimeoutMs: 1_000,
    retryMs: 100,
  });
  links.push(link);
  await link.start();
  return link;
}

/** Fake draw.io window answering every request with `${method}:ok`. */
function connectWindow(port: number, windowId = 'w1') {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: ORIGIN });
    sockets.push(socket);
    socket.on('open', () =>
      socket.send(JSON.stringify({ type: 'hello', token: TOKEN, windowId, title: 'Map' })),
    );
    socket.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'welcome') resolve(socket);
      if (msg.type === 'request') {
        socket.send(
          JSON.stringify({ type: 'response', id: msg.id, ok: true, result: `${msg.method}:ok` }),
        );
      }
    });
    socket.on('error', reject);
  });
}

const until = async (check: () => boolean | Promise<boolean>, ms = 3_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
};

describe('hub and relays', () => {
  it('a second instance relays tool calls through the first', async () => {
    const port = await freePort();
    const hub = await startLink(port);
    const relay = await startLink(port);
    expect([hub.mode, relay.mode]).toEqual(['hub', 'relay']);

    await connectWindow(port);
    expect(await relay.windows()).toEqual([expect.objectContaining({ windowId: 'w1' })]);
    expect(await relay.request(undefined, 'getSelection', {})).toBe('getSelection:ok');
    await expect(relay.request('nope', 'getSelection', {})).rejects.toThrow(
      'No connected draw.io window with id nope.',
    );
  });

  it('a relay takes over the port when the hub stops', async () => {
    const port = await freePort();
    const hub = await startLink(port);
    const relay = await startLink(port);
    await hub.stop();

    await until(() => relay.mode === 'hub');
    await connectWindow(port); // the plugin reconnects on its own
    expect(await relay.request(undefined, 'getMindmap', {})).toBe('getMindmap:ok');
  });

  it('of several relays, one becomes the hub and the others relay through it', async () => {
    const port = await freePort();
    const hub = await startLink(port);
    const a = await startLink(port);
    const b = await startLink(port);
    await hub.stop();

    await until(() => [a.mode, b.mode].sort().join() === 'hub,relay');
    await connectWindow(port);
    expect(await a.request(undefined, 'x', {})).toBe('x:ok');
    expect(await b.request(undefined, 'y', {})).toBe('y:ok');
  });
});

describe('roles', () => {
  const helloClose = (port: number, origin: string | undefined, hello: object) =>
    new Promise<number>((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : {});
      sockets.push(socket);
      socket.on('open', () => socket.send(JSON.stringify(hello)));
      socket.on('close', resolve);
    });

  it('browsers cannot register as relays, local processes not as windows', async () => {
    const port = await freePort();
    await startLink(port);
    expect(await helloClose(port, ORIGIN, { type: 'hello', role: 'relay', token: TOKEN })).toBe(
      CLOSE_PROTOCOL,
    );
    expect(
      await helloClose(port, undefined, { type: 'hello', token: TOKEN, windowId: 'w', title: 't' }),
    ).toBe(CLOSE_PROTOCOL);
  });

  it('a relay with the wrong token is turned away and keeps retrying', async () => {
    const port = await freePort();
    await startLink(port);
    const other = new BridgeLink({
      port,
      token: 'some-other-token-0123456789',
      allowedOrigins: [ORIGIN],
      retryMs: 50,
    });
    links.push(other);
    void other.start();
    await new Promise((r) => setTimeout(r, 300));
    expect(other.mode).toBe('down');
    await expect(other.request(undefined, 'x', {})).rejects.toThrow(/Reconnecting/);
  });
});
