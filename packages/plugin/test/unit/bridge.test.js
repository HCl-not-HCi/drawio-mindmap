import { describe, expect, it, vi } from 'vitest';
import { createBridge, createHandlers, TOKEN_KEY } from '../../src/bridge.js';

// Fake WebSocket recording sent messages; tests drive the server side by hand.
function fakeSocketClass() {
  const instances = [];
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      instances.push(this);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1000 });
    }
    // test helpers
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    receive(msg) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }
    serverClose(code) {
      this.readyState = 3;
      this.onclose?.({ code });
    }
  }
  return { FakeSocket, instances };
}

const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
};

const fakeUi = (graph = {}) => ({
  editor: { graph: { getModel: () => ({ beginUpdate() {}, endUpdate() {} }), ...graph } },
  getCurrentFile: () => ({ getTitle: () => 'Notes.drawio' }),
});

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup({ token = 'secret', commands = {} } = {}) {
  const { FakeSocket, instances } = fakeSocketClass();
  const statuses = [];
  const bridge = createBridge({
    ui: fakeUi(),
    commands,
    storage: memoryStorage(token ? { [TOKEN_KEY]: token } : {}),
    WebSocketImpl: FakeSocket,
    onStatus: (s) => statuses.push(s.state),
  });
  return { bridge, instances, statuses };
}

describe('createBridge', () => {
  it('is off until enabled, then says hello with the token and title', () => {
    const { bridge, instances } = setup();
    expect(bridge.status.state).toBe('off');
    expect(instances).toHaveLength(0);

    bridge.enable();
    instances[0].open();
    expect(instances[0].sent[0]).toEqual({
      type: 'hello',
      token: 'secret',
      windowId: bridge.windowId,
      title: 'Notes.drawio',
    });
    instances[0].receive({ type: 'welcome' });
    expect(bridge.status.state).toBe('connected');
  });

  it('runs requests and answers with results or errors', async () => {
    const commands = {
      renameTopic: vi.fn(),
      deleteTopic: () => {
        throw new Error('Unknown topic: x');
      },
    };
    const { bridge, instances } = setup({ commands });
    bridge.enable();
    instances[0].open();
    instances[0].receive({ type: 'welcome' });
    instances[0].receive({
      type: 'request',
      id: '1',
      method: 'renameTopic',
      params: { topicId: 't', label: 'New' },
    });
    instances[0].receive({
      type: 'request',
      id: '2',
      method: 'deleteTopic',
      params: { topicId: 'x' },
    });
    instances[0].receive({ type: 'request', id: '3', method: 'eval', params: {} });
    await flush();
    expect(commands.renameTopic).toHaveBeenCalledWith('t', 'New');
    expect(instances[0].sent.slice(1)).toEqual([
      { type: 'response', id: '1', ok: true, result: { id: 't', label: 'New' } },
      { type: 'response', id: '2', ok: false, error: 'Unknown topic: x' },
      { type: 'response', id: '3', ok: false, error: 'Unknown method: eval' },
    ]);
  });

  it('stops on a rejected token and asks for a token when none is set', () => {
    const { bridge, instances } = setup();
    bridge.enable();
    instances[0].open();
    instances[0].serverClose(4401);
    expect(bridge.status).toMatchObject({ state: 'error' });
    expect(bridge.status.detail).toMatch(/rejected the token/);

    const noToken = setup({ token: null });
    noToken.bridge.enable();
    expect(noToken.instances).toHaveLength(0);
    expect(noToken.bridge.status.detail).toMatch(/No bridge token/);
  });

  it('reconnects with backoff while enabled, and not after disable', () => {
    vi.useFakeTimers();
    try {
      const { bridge, instances } = setup();
      bridge.enable();
      instances[0].serverClose(1006);
      expect(bridge.status.state).toBe('connecting');
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(2);

      bridge.disable();
      expect(bridge.status.state).toBe('off');
      vi.advanceTimersByTime(60_000);
      expect(instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createHandlers', () => {
  it('reads the only map, lists several, and explains an empty page', () => {
    const outline = { id: 'r', label: 'R', children: [{ id: 'a', label: 'A', children: [] }] };
    let maps = [{ id: 'r', label: 'R' }];
    const commands = { listMindmaps: () => maps, getMindmap: () => outline };
    const h = createHandlers(fakeUi().editor.graph, commands);
    expect(h.getMindmap({ topicId: null })).toBe(outline);
    maps = [...maps, { id: 'r2', label: 'R2' }];
    expect(h.getMindmap({ topicId: null })).toMatchObject({ mindmaps: maps });
    maps = [];
    expect(() => h.getMindmap({ topicId: null })).toThrow(/no mindmap on the current page/);
  });

  it('adds several topics in one batch and returns their ids', () => {
    const calls = [];
    const model = { beginUpdate: () => calls.push('begin'), endUpdate: () => calls.push('end') };
    const commands = { addChild: (p, l) => (calls.push(l), `${p}/${l}`) };
    const h = createHandlers({ getModel: () => model }, commands);
    expect(h.addTopics({ parentId: 'p', labels: ['A', 'B'] })).toEqual(['p/A', 'p/B']);
    expect(calls).toEqual(['begin', 'A', 'B', 'end']);
  });

  it('labels the selection', () => {
    const commands = {
      getSelectedTopics: () => ['a'],
      getMindmap: () => ({
        id: 'r',
        label: 'R',
        children: [{ id: 'a', label: 'A', children: [] }],
      }),
    };
    expect(createHandlers(fakeUi().editor.graph, commands).getSelection()).toEqual([
      { id: 'a', label: 'A' },
    ]);
  });
});
