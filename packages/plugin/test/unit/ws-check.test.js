import { describe, expect, it, vi } from 'vitest';
import { checkWebSocket, DEFAULT_WS_URL } from '../../src/spike/ws-check.js';

// Minimal fake: behaviour is chosen per test via `script(socket)`.
function fakeWebSocket(script) {
  return class FakeSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.closed = false;
      queueMicrotask(() => script(this));
    }
    send(data) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
    }
  };
}

describe('checkWebSocket', () => {
  it('succeeds when the server echoes the payload', async () => {
    const Impl = fakeWebSocket((s) => {
      s.onopen();
      s.onmessage({ data: s.sent[0] });
    });
    const result = await checkWebSocket({ WebSocketImpl: Impl });
    expect(result).toEqual({ ok: true, url: DEFAULT_WS_URL, detail: 'echo received' });
  });

  it('fails on an unexpected reply', async () => {
    const Impl = fakeWebSocket((s) => {
      s.onopen();
      s.onmessage({ data: 'nope' });
    });
    const result = await checkWebSocket({ WebSocketImpl: Impl });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/unexpected reply/);
  });

  it('fails when the constructor throws (CSP SecurityError)', async () => {
    class Throwing {
      constructor() {
        const e = new Error('Refused to connect');
        e.name = 'SecurityError';
        throw e;
      }
    }
    const result = await checkWebSocket({ WebSocketImpl: Throwing });
    expect(result).toMatchObject({ ok: false, detail: expect.stringMatching(/SecurityError/) });
  });

  it('fails on error event and only resolves once', async () => {
    const Impl = fakeWebSocket((s) => {
      s.onerror();
      s.onclose({ code: 1006 });
    });
    const result = await checkWebSocket({ WebSocketImpl: Impl, url: 'ws://127.0.0.1:1' });
    expect(result).toMatchObject({ ok: false, url: 'ws://127.0.0.1:1' });
    expect(result.detail).toMatch(/connection failed/);
  });

  it('times out when nothing happens', async () => {
    vi.useFakeTimers();
    try {
      const Impl = fakeWebSocket(() => {});
      const pending = checkWebSocket({ WebSocketImpl: Impl, timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(60);
      await expect(pending).resolves.toMatchObject({ ok: false, detail: 'timeout after 50 ms' });
    } finally {
      vi.useRealTimers();
    }
  });
});
