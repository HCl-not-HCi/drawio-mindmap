// Relay client: used by an MCP server process when another one (the hub) already owns
// the bridge port. Forwards tool calls to the hub, which talks to the draw.io windows.
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { BridgeError, type WindowInfo } from './bridge.js';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class RelayClient {
  private socket: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private closeHandler: () => void = () => {};

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  /** Connects and authenticates; rejects if the hub doesn't welcome this relay. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url); // no Origin header: a local process
      let welcomed = false;
      socket.on('open', () =>
        socket.send(JSON.stringify({ type: 'hello', role: 'relay', token: this.token })),
      );
      socket.on('message', (data) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.type === 'welcome') {
          welcomed = true;
          this.socket = socket;
          resolve();
        } else if (msg.type === 'relay-response' && typeof msg.id === 'string') {
          const p = this.pending.get(msg.id);
          if (p == null) return;
          this.pending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.ok === true) p.resolve(msg.result);
          else p.reject(new BridgeError(String(msg.error ?? 'Unknown error.')));
        }
      });
      socket.on('error', (e) => {
        if (!welcomed) reject(e);
      });
      socket.on('close', (code) => {
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(new BridgeError('Lost the connection to the draw.io bridge; try again.'));
        }
        this.pending.clear();
        this.socket = null;
        if (welcomed) this.closeHandler();
        else reject(new Error(`hub closed the connection (${code})`));
      });
    });
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  close(): void {
    this.socket?.close(1000, 'relay stopping');
  }

  windows(): Promise<WindowInfo[]> {
    return this.send({ op: 'windows' }) as Promise<WindowInfo[]>;
  }

  request(windowId: string | undefined, method: string, params: unknown): Promise<unknown> {
    return this.send({ op: 'request', windowId: windowId ?? null, method, params });
  }

  private send(body: Record<string, unknown>): Promise<unknown> {
    const socket = this.socket;
    if (socket == null) {
      return Promise.reject(new BridgeError('Not connected to the draw.io bridge; try again.'));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      // A little longer than the hub's own timeout, so the hub's message wins.
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeError(`draw.io did not answer within ${this.timeoutMs} ms.`));
      }, this.timeoutMs + 2_000);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ type: 'relay-request', id, ...body }));
    });
  }
}
