// Connects an MCP server process to the draw.io windows, whether it is the first one
// (it becomes the hub and owns the bridge port) or a later one (it relays through the hub).
// If the hub process exits, relays race to take over the port; the losers relay again.
// Browser windows always talk to the port and reconnect on their own.
import { Bridge, BridgeError, type BridgeOptions, type WindowInfo } from './bridge.js';
import { RelayClient } from './relay.js';

export type LinkMode = 'starting' | 'hub' | 'relay' | 'down' | 'stopped';

/** What the MCP tools need from the bridge. */
export interface WindowBridge {
  windows(): WindowInfo[] | Promise<WindowInfo[]>;
  request(windowId: string | undefined, method: string, params: unknown): Promise<unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isAddressInUse = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'EADDRINUSE';

export class BridgeLink implements WindowBridge {
  mode: LinkMode = 'starting';
  private hub: Bridge | null = null;
  private relay: RelayClient | null = null;
  private readonly options: BridgeOptions & { retryMs: number };
  private readonly log: (message: string) => void;
  private warnedBusy = false;

  constructor(options: BridgeOptions & { retryMs?: number }) {
    this.options = { retryMs: 2_000, ...options };
    this.log = options.log ?? (() => {});
  }

  /** Resolves once this process is the hub or a relay (retries until then). */
  async start(): Promise<void> {
    while (this.mode !== 'stopped') {
      // 1. Try to own the port.
      const hub = new Bridge(this.options);
      try {
        await hub.start();
        this.hub = hub;
        this.mode = 'hub';
        this.warnedBusy = false;
        this.log(`bridge listening on ws://127.0.0.1:${this.options.port}`);
        return;
      } catch (e) {
        if (!isAddressInUse(e)) throw e;
      }
      // 2. The port is taken: relay through whoever owns it.
      const relay = new RelayClient(
        `ws://127.0.0.1:${this.options.port}`,
        this.options.token,
        this.options.requestTimeoutMs ?? 15_000,
      );
      try {
        await relay.connect();
        this.relay = relay;
        this.mode = 'relay';
        this.warnedBusy = false;
        this.log(`port ${this.options.port} in use by another instance: relaying through it`);
        relay.onClose(() => {
          if (this.mode === 'stopped') return;
          this.relay = null;
          this.mode = 'down';
          this.log('lost the hub; taking over or reconnecting');
          // Jitter, so several relays don't all race for the port at once.
          void sleep(Math.random() * 300).then(() => this.start());
        });
        return;
      } catch (e) {
        if (!this.warnedBusy) {
          this.log(
            `port ${this.options.port} is in use, but not by a drawio-mindmap bridge with this ` +
              `token (${(e as Error).message}); retrying`,
          );
          this.warnedBusy = true;
        }
        this.mode = 'down';
        await sleep(this.options.retryMs);
      }
    }
  }

  async stop(): Promise<void> {
    this.mode = 'stopped';
    this.relay?.close();
    await this.hub?.stop();
  }

  windows(): WindowInfo[] | Promise<WindowInfo[]> {
    if (this.hub) return this.hub.windows();
    if (this.relay) return this.relay.windows();
    return [];
  }

  request(windowId: string | undefined, method: string, params: unknown): Promise<unknown> {
    if (this.hub) return this.hub.request(windowId, method, params);
    if (this.relay) return this.relay.request(windowId, method, params);
    return Promise.reject(
      new BridgeError('Reconnecting to the draw.io bridge; try again in a moment.'),
    );
  }
}
