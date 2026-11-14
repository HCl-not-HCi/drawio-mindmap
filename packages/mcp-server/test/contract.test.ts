// Contract tests: MCP client ↔ server (in memory) ↔ bridge ↔ fake plugin (WebSocket).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { Bridge, CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL } from '../src/bridge.js';
import { registerTools } from '../src/tools.js';

const TOKEN = 'test-token-0123456789';
const ORIGIN = 'http://localhost:8080';

type Handler = (method: string, params: any) => unknown;

let bridge: Bridge;
let port: number;
let client: Client;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  bridge = new Bridge({ port: 0, token: TOKEN, allowedOrigins: [ORIGIN], requestTimeoutMs: 500 });
  port = await bridge.start();
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerTools(server, bridge);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.terminate());
  await client.close();
  await bridge.stop();
});

/** A fake plugin window; resolves once welcomed, or with the close code if rejected. */
function connectPlugin(
  { token = TOKEN, windowId = 'w1', title = 'Diagram', origin = ORIGIN } = {},
  handler: Handler = () => null,
): Promise<{ socket: WebSocket; welcomed: boolean; closeCode?: number }> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    sockets.push(socket);
    socket.on('open', () => socket.send(JSON.stringify({ type: 'hello', token, windowId, title })));
    socket.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'welcome') return resolve({ socket, welcomed: true });
      if (msg.type === 'request') {
        try {
          const result = await handler(msg.method, msg.params);
          socket.send(JSON.stringify({ type: 'response', id: msg.id, ok: true, result }));
        } catch (e) {
          socket.send(
            JSON.stringify({
              type: 'response',
              id: msg.id,
              ok: false,
              error: (e as Error).message,
            }),
          );
        }
      }
    });
    socket.on('close', (code) => resolve({ socket, welcomed: false, closeCode: code }));
    socket.on('error', () => resolve({ socket, welcomed: false }));
  });
}

const callTool = async (name: string, args: Record<string, unknown> = {}) => {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[];
    isError?: boolean;
  };
  const text = result.content[0]?.text ?? '';
  return { isError: result.isError === true, text, json: () => JSON.parse(text) };
};

describe('authentication', () => {
  it('rejects a wrong token and keeps the window out of the list', async () => {
    const { welcomed, closeCode } = await connectPlugin({ token: 'wrong-token-0123456789' });
    expect(welcomed).toBe(false);
    expect(closeCode).toBe(CLOSE_INVALID_TOKEN);
    expect((await callTool('list_windows')).json()).toEqual([]);
  });

  it('rejects other browser origins', async () => {
    const { welcomed } = await connectPlugin({ origin: 'https://evil.example' });
    expect(welcomed).toBe(false);
  });

  it('requires a hello as first message', async () => {
    const closeCode = await new Promise<number>((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: ORIGIN });
      sockets.push(socket);
      socket.on('open', () => socket.send(JSON.stringify({ type: 'request', id: 'x' })));
      socket.on('close', resolve);
    });
    expect(closeCode).toBe(CLOSE_PROTOCOL);
  });

  it('lists accepted windows', async () => {
    await connectPlugin({ windowId: 'w1', title: 'Notes' });
    const windows = (await callTool('list_windows')).json();
    expect(windows).toEqual([
      { window_id: 'w1', title: 'Notes', connected_at: expect.any(String) },
    ]);
  });
});

describe('tools', () => {
  it('lists the documented tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_topics',
      'delete_topic',
      'get_mindmap',
      'get_selection',
      'insert_outline',
      'list_windows',
      'move_topic',
      'rename_topic',
    ]);
    const del = tools.find((t) => t.name === 'delete_topic');
    expect(del?.annotations?.destructiveHint).toBe(true);
  });

  it('forwards calls to the plugin with mapped parameters', async () => {
    const calls: [string, unknown][] = [];
    await connectPlugin({}, (method, params) => {
      calls.push([method, params]);
      return method === 'addTopics' ? ['t1', 't2'] : { ok: true };
    });
    expect((await callTool('add_topics', { parent_id: 'p', labels: ['A', 'B'] })).json()).toEqual([
      't1',
      't2',
    ]);
    await callTool('move_topic', { topic_id: 'a', new_parent_id: 'b' });
    await callTool('insert_outline', { markdown: '- x' });
    expect(calls).toEqual([
      ['addTopics', { parentId: 'p', labels: ['A', 'B'] }],
      ['moveTopic', { topicId: 'a', parentId: 'b', beforeId: null }],
      ['insertOutline', { markdown: '- x', parentId: null }],
    ]);
  });

  it('validates input before anything reaches the plugin', async () => {
    let reached = false;
    await connectPlugin({}, () => {
      reached = true;
    });
    const result = await callTool('add_topics', { parent_id: 'p', labels: [] });
    expect(result.isError).toBe(true);
    expect(reached).toBe(false);
  });

  it('returns plugin errors as tool errors', async () => {
    await connectPlugin({}, () => {
      throw new Error('Unknown topic: nope');
    });
    const result = await callTool('rename_topic', { topic_id: 'nope', label: 'x' });
    expect(result).toMatchObject({ isError: true, text: 'Unknown topic: nope' });
  });
});

describe('failure cases', () => {
  it('explains how to connect when no window is connected', async () => {
    const result = await callTool('get_mindmap');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Live LLM Control');
  });

  it('asks for window_id when several windows are connected', async () => {
    await connectPlugin({ windowId: 'w1', title: 'One' });
    await connectPlugin({ windowId: 'w2', title: 'Two' }, () => 'from w2');
    const ambiguous = await callTool('get_selection');
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.text).toContain('w1 (One)');
    expect((await callTool('get_selection', { window_id: 'w2' })).json()).toBe('from w2');
  });

  it('fails cleanly when the window disconnects mid-call', async () => {
    const { socket } = await connectPlugin({}, () => {
      socket.close();
      return new Promise(() => {});
    });
    const result = await callTool('get_mindmap');
    expect(result).toMatchObject({ isError: true });
    expect(result.text).toMatch(/disconnected/);
  });

  it('times out when the window does not answer', async () => {
    await connectPlugin({}, () => new Promise(() => {}));
    const result = await callTool('get_mindmap');
    expect(result.text).toMatch(/did not answer within 500 ms/);
  });
});
