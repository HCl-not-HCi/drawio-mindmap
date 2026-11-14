// Live LLM control: connects this draw.io window to the local MCP server
// (packages/mcp-server) over a WebSocket, while the user has the toggle on.
// Requests run one at a time through the normal commands, so every LLM change is one
// undo step with layout and colors, exactly like keyboard edits. See decisions D22.
import { log } from './log.js';
import { parseMarkdown } from './io/markdown.js';

export const BRIDGE_URL = 'ws://127.0.0.1:47100';
export const TOKEN_KEY = 'drawio-mindmap.bridgeToken';
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000];
const CLOSE_INVALID_TOKEN = 4401;

const safeStorage = (storage) => ({
  get: (key) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      if (value == null) storage?.removeItem(key);
      else storage?.setItem(key, value);
    } catch {
      // storage unavailable: the token lasts for this page only
    }
  },
});

/** Finds a topic's label in an outline. */
function findLabel(outline, id) {
  if (outline.id === id) return outline.label;
  for (const c of outline.children) {
    const found = findLabel(c, id);
    if (found != null) return found;
  }
  return null;
}

/** Request handlers: method name → (params) => result. */
export function createHandlers(graph, commands) {
  const model = graph.getModel();
  const batch = (fn) => {
    model.beginUpdate();
    try {
      return fn();
    } finally {
      model.endUpdate();
    }
  };
  return {
    getMindmap({ topicId }) {
      if (topicId != null) return commands.getMindmap(topicId);
      const maps = commands.listMindmaps();
      if (maps.length === 1) return commands.getMindmap(maps[0].id);
      if (maps.length === 0) {
        throw new Error(
          'There is no mindmap on the current page. Use insert_outline without parent_id to create one.',
        );
      }
      return { mindmaps: maps, hint: 'Several mindmaps on this page: pass topic_id to read one.' };
    },
    getSelection() {
      return commands.getSelectedTopics().map((id) => ({
        id,
        label: findLabel(commands.getMindmap(id), id),
      }));
    },
    addTopics({ parentId, labels }) {
      return batch(() => labels.map((label) => commands.addChild(parentId, label)));
    },
    renameTopic({ topicId, label }) {
      commands.renameTopic(topicId, label);
      return { id: topicId, label };
    },
    moveTopic({ topicId, parentId, beforeId }) {
      commands.moveTopic(topicId, parentId, { beforeId });
      return { id: topicId, parentId };
    },
    deleteTopic({ topicId }) {
      return commands.deleteTopic(topicId);
    },
    insertOutline({ markdown, parentId }) {
      if (parentId == null) return [commands.importText(markdown, { format: 'markdown' })];
      const forest = parseMarkdown(markdown);
      if (forest.length === 0) throw new Error('The outline contains no topics.');
      return batch(() => forest.map((n) => commands.importOutline(n, { parentId })));
    },
  };
}

/**
 * @param {{ui: object, commands: object, url?: string, storage?: Storage,
 *          WebSocketImpl?: typeof WebSocket, onStatus?: (status) => void}} options
 */
export function createBridge({
  ui,
  commands,
  url = BRIDGE_URL,
  storage = globalThis.localStorage,
  WebSocketImpl = globalThis.WebSocket,
  onStatus = () => {},
}) {
  const store = safeStorage(storage);
  const handlers = createHandlers(ui.editor.graph, commands);
  const windowId = globalThis.crypto?.randomUUID?.() ?? `w-${Date.now()}-${Math.random()}`;
  let enabled = false;
  let socket = null;
  let retry = 0;
  let retryTimer = null;
  let queue = Promise.resolve();
  let status = { state: 'off', detail: 'Live LLM Control is off.' };

  const setStatus = (state, detail) => {
    status = { state, detail };
    onStatus(status);
  };
  const title = () => ui.getCurrentFile?.()?.getTitle?.() ?? document.title ?? 'draw.io';

  const handle = async ({ id, method, params }) => {
    let response;
    try {
      const fn = handlers[method];
      if (fn == null) throw new Error(`Unknown method: ${method}`);
      response = { type: 'response', id, ok: true, result: fn(params ?? {}) ?? null };
    } catch (e) {
      response = { type: 'response', id, ok: false, error: e?.message ?? String(e) };
    }
    if (socket?.readyState === 1) socket.send(JSON.stringify(response));
  };

  const scheduleRetry = () => {
    if (!enabled) return;
    const delay = RETRY_DELAYS_MS[Math.min(retry, RETRY_DELAYS_MS.length - 1)];
    retry++;
    setStatus('connecting', `MCP server not reachable; retrying in ${delay / 1000} s.`);
    retryTimer = setTimeout(connect, delay);
  };

  function connect() {
    clearTimeout(retryTimer);
    if (!enabled) return;
    const token = store.get(TOKEN_KEY);
    if (!token) {
      setStatus('error', 'No bridge token set (Extras → Mindmap → Set LLM Bridge Token).');
      return;
    }
    setStatus('connecting', `Connecting to ${url}...`);
    let ws;
    try {
      ws = new WebSocketImpl(url);
    } catch (e) {
      setStatus('error', `Cannot connect: ${e?.message ?? e}`);
      return;
    }
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', token, windowId, title: title() }));
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        retry = 0;
        setStatus('connected', `Connected to the MCP server as "${title()}".`);
      } else if (msg.type === 'request') {
        // One at a time, each in its own transaction (= one undo step).
        queue = queue.then(() => handle(msg));
      }
    };
    ws.onclose = (event) => {
      if (socket !== ws) return;
      socket = null;
      if (!enabled) return;
      if (event.code === CLOSE_INVALID_TOKEN) {
        setStatus('error', 'The MCP server rejected the token. Set the current token and retry.');
        return;
      }
      scheduleRetry();
    };
    ws.onerror = () => log.warn('bridge connection error');
  }

  const bridge = {
    windowId,
    get status() {
      return status;
    },
    get enabled() {
      return enabled;
    },
    hasToken: () => Boolean(store.get(TOKEN_KEY)),
    setToken(token) {
      store.set(TOKEN_KEY, token?.trim() || null);
      if (enabled) {
        retry = 0;
        socket?.close();
        connect();
      }
    },
    enable() {
      if (enabled) return;
      enabled = true;
      retry = 0;
      connect();
    },
    disable() {
      enabled = false;
      clearTimeout(retryTimer);
      const s = socket;
      socket = null;
      s?.close(1000, 'disabled');
      setStatus('off', 'Live LLM Control is off.');
    },
    toggle() {
      if (enabled) bridge.disable();
      else bridge.enable();
    },
    /** Tells the server about a changed window title. */
    updateTitle() {
      if (socket?.readyState === 1) socket.send(JSON.stringify({ type: 'status', title: title() }));
    },
  };
  return bridge;
}
