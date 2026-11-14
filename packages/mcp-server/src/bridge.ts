// WebSocket bridge between this MCP server and the plugin in open draw.io windows.
//
// Protocol (JSON messages):
//   plugin → server  {type: "hello", token, windowId, title}       (first message, within 5 s)
//   server → plugin  {type: "welcome"}                             or close 4401 / 4400
//   server → plugin  {type: "request", id, method, params}
//   plugin → server  {type: "response", id, ok: true, result} | {type: "response", id, ok: false, error}
//   plugin → server  {type: "status", title}                       (window title changed)
//
// Relays: further MCP server processes (Claude Desktop and Claude Code may start several)
// can't listen on the same port, so they connect to this one ("hub") as relays:
//   relay → hub      {type: "hello", role: "relay", token}
//   relay → hub      {type: "relay-request", id, op: "windows" | "request", windowId, method, params}
//   hub → relay      {type: "relay-response", id, ok, result | error}
//
// Security: listens on 127.0.0.1 only; windows must come from an allowed browser origin,
// relays from a local non-browser process (no Origin header); both need the shared token
// (docs/decisions.md D22, D23).
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

export interface BridgeOptions {
  host?: string;
  port: number;
  token: string;
  /** Allowed Origin headers; empty = any origin (tests only). */
  allowedOrigins: string[];
  requestTimeoutMs?: number;
  helloTimeoutMs?: number;
  log?: (message: string) => void;
}

export interface WindowInfo {
  windowId: string;
  title: string;
  connectedAt: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface Connection extends WindowInfo {
  socket: WebSocket;
  pending: Map<string, Pending>;
}

export class BridgeError extends Error {}

export const CLOSE_INVALID_TOKEN = 4401;
export const CLOSE_PROTOCOL = 4400;

function tokensEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

export class Bridge {
  private server: WebSocketServer | null = null;
  private readonly connections = new Map<string, Connection>();
  private readonly relays = new Set<WebSocket>();
  private readonly options: Required<BridgeOptions>;

  constructor(options: BridgeOptions) {
    this.options = {
      host: '127.0.0.1',
      requestTimeoutMs: 15_000,
      helloTimeoutMs: 5_000,
      log: () => {},
      ...options,
    };
  }

  /** Starts listening; resolves with the actual port (useful with port 0). */
  start(): Promise<number> {
    const { host, port, allowedOrigins } = this.options;
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({
        host,
        port,
        maxPayload: 4 * 1024 * 1024,
        // Browsers always send Origin: only allowed ones get in. Local processes send none
        // and may only register as relays (checked at hello).
        verifyClient: ({ req }: { req: IncomingMessage }) =>
          allowedOrigins.length === 0 ||
          req.headers.origin == null ||
          allowedOrigins.includes(req.headers.origin),
      });
      server.once('error', reject);
      server.once('listening', () => {
        server.off('error', reject);
        server.on('error', (e) => this.options.log(`bridge error: ${e.message}`));
        const address = server.address();
        resolve(typeof address === 'object' && address != null ? address.port : port);
      });
      server.on('connection', (socket, req) => this.accept(socket, req.headers.origin));
      this.server = server;
    });
  }

  async stop(): Promise<void> {
    for (const c of this.connections.values()) c.socket.close(1001, 'server stopping');
    for (const r of this.relays) r.close(1001, 'server stopping');
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
    this.server = null;
  }

  windows(): WindowInfo[] {
    return [...this.connections.values()].map(({ windowId, title, connectedAt }) => ({
      windowId,
      title,
      connectedAt,
    }));
  }

  /** Sends a request to a window (default: the only connected one) and awaits the result. */
  request(windowId: string | undefined, method: string, params: unknown): Promise<unknown> {
    const connection = this.pick(windowId);
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        connection.pending.delete(id);
        reject(
          new BridgeError(`draw.io did not answer within ${this.options.requestTimeoutMs} ms.`),
        );
      }, this.options.requestTimeoutMs);
      connection.pending.set(id, { resolve, reject, timer });
      connection.socket.send(JSON.stringify({ type: 'request', id, method, params }));
    });
  }

  private pick(windowId: string | undefined): Connection {
    if (windowId != null) {
      const c = this.connections.get(windowId);
      if (c == null) throw new BridgeError(`No connected draw.io window with id ${windowId}.`);
      return c;
    }
    const all = [...this.connections.values()];
    if (all.length === 0) {
      throw new BridgeError(
        'No draw.io window is connected. In draw.io, turn on Extras → Mindmap → Live LLM Control.',
      );
    }
    if (all.length > 1) {
      const list = all.map((c) => `${c.windowId} (${c.title})`).join(', ');
      throw new BridgeError(`Several draw.io windows are connected; pass window_id: ${list}.`);
    }
    return all[0];
  }

  private async handleRelayMessage(socket: WebSocket, message: Record<string, unknown>) {
    if (message.type !== 'relay-request' || typeof message.id !== 'string') return;
    const reply = (body: Record<string, unknown>) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'relay-response', id: message.id, ...body }));
      }
    };
    try {
      const result =
        message.op === 'windows'
          ? this.windows()
          : await this.request(
              typeof message.windowId === 'string' ? message.windowId : undefined,
              String(message.method),
              message.params,
            );
      reply({ ok: true, result });
    } catch (e) {
      reply({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  private accept(socket: WebSocket, origin: string | undefined): void {
    let connection: Connection | null = null;
    let relay = false;
    const helloTimer = setTimeout(
      () => socket.close(CLOSE_PROTOCOL, 'expected hello'),
      this.options.helloTimeoutMs,
    );

    socket.on('message', (data) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(data.toString());
      } catch {
        socket.close(CLOSE_PROTOCOL, 'invalid JSON');
        return;
      }
      if (relay) {
        this.handleRelayMessage(socket, message);
        return;
      }
      if (connection == null) {
        clearTimeout(helloTimer);
        if (message.type !== 'hello') {
          socket.close(CLOSE_PROTOCOL, 'expected hello');
          return;
        }
        if (typeof message.token !== 'string' || !tokensEqual(message.token, this.options.token)) {
          this.options.log('rejected a connection with an invalid token');
          socket.close(CLOSE_INVALID_TOKEN, 'invalid token');
          return;
        }
        if (message.role === 'relay') {
          if (origin != null) {
            socket.close(CLOSE_PROTOCOL, 'relays must not be browsers');
            return;
          }
          relay = true;
          this.relays.add(socket);
          socket.send(JSON.stringify({ type: 'welcome' }));
          this.options.log('relay connected');
          return;
        }
        const browserOk =
          this.options.allowedOrigins.length === 0 ||
          (origin != null && this.options.allowedOrigins.includes(origin));
        if (!browserOk || typeof message.windowId !== 'string') {
          socket.close(CLOSE_PROTOCOL, 'windows must come from an allowed origin');
          return;
        }
        this.connections.get(message.windowId)?.socket.close(1000, 'replaced');
        connection = {
          socket,
          windowId: message.windowId,
          title: typeof message.title === 'string' ? message.title : 'Untitled',
          connectedAt: new Date().toISOString(),
          pending: new Map(),
        };
        this.connections.set(connection.windowId, connection);
        socket.send(JSON.stringify({ type: 'welcome' }));
        this.options.log(`window connected: ${connection.windowId} (${connection.title})`);
        return;
      }
      if (message.type === 'status' && typeof message.title === 'string') {
        connection.title = message.title;
        return;
      }
      if (message.type === 'response' && typeof message.id === 'string') {
        const pending = connection.pending.get(message.id);
        if (pending == null) return;
        connection.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.ok === true) pending.resolve(message.result);
        else pending.reject(new BridgeError(String(message.error ?? 'Unknown error in draw.io.')));
      }
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (relay) {
        this.relays.delete(socket);
        this.options.log('relay disconnected');
        return;
      }
      if (connection == null) return;
      for (const p of connection.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new BridgeError('The draw.io window disconnected before answering.'));
      }
      if (this.connections.get(connection.windowId) === connection) {
        this.connections.delete(connection.windowId);
        this.options.log(`window disconnected: ${connection.windowId}`);
      }
    });
  }
}
