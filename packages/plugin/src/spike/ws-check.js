// M0 spike: can the plugin open a WebSocket to a local server from inside draw.io?
// Sends one message and waits for the echo. Replaced by src/bridge.js in M6.

export const DEFAULT_WS_URL = 'ws://127.0.0.1:47100';

/**
 * @param {object} [opts]
 * @param {string} [opts.url]
 * @param {number} [opts.timeoutMs]
 * @param {typeof WebSocket} [opts.WebSocketImpl] injectable for tests
 * @returns {Promise<{ok: boolean, url: string, detail: string}>}
 */
export function checkWebSocket({
  url = DEFAULT_WS_URL,
  timeoutMs = 3000,
  WebSocketImpl = globalThis.WebSocket,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // ignore
      }
      resolve({ ok, url, detail });
    };
    const timer = setTimeout(() => finish(false, `timeout after ${timeoutMs} ms`), timeoutMs);
    const payload = `mindmap-ping-${Date.now()}`;

    try {
      // A CSP violation throws synchronously (SecurityError) in some browsers
      // and fails asynchronously (error event) in others.
      socket = new WebSocketImpl(url);
    } catch (e) {
      finish(false, `constructor threw: ${e?.name ?? 'Error'}: ${e?.message ?? e}`);
      return;
    }
    socket.onopen = () => socket.send(payload);
    socket.onmessage = (ev) =>
      ev.data === payload
        ? finish(true, 'echo received')
        : finish(false, `unexpected reply: ${String(ev.data).slice(0, 100)}`);
    socket.onerror = () =>
      finish(false, 'connection failed (server not running, or blocked by CSP; see console)');
    socket.onclose = (ev) => finish(false, `closed before echo (code ${ev.code})`);
  });
}
