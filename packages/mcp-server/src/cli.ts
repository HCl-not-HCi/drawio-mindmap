#!/usr/bin/env node
// drawio-mindmap-mcp          runs the MCP server (stdio) and the WebSocket bridge
// drawio-mindmap-mcp token    prints the token to paste into the plugin
//
// Environment: MINDMAP_BRIDGE_PORT (47100), MINDMAP_BRIDGE_ORIGINS (comma-separated,
// default http://localhost:8080), MINDMAP_BRIDGE_TOKEN / MINDMAP_BRIDGE_TOKEN_FILE.
// stdout is the MCP channel; all logging goes to stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Bridge } from './bridge.js';
import { loadOrCreateToken } from './token.js';
import { registerTools } from './tools.js';

const VERSION = '0.1.0';
const log = (message: string) => process.stderr.write(`[drawio-mindmap-mcp] ${message}\n`);

async function main() {
  const token = loadOrCreateToken();
  if (process.argv[2] === 'token') {
    process.stdout.write(`${token}\n`);
    return;
  }

  const port = Number(process.env.MINDMAP_BRIDGE_PORT ?? 47100);
  const allowedOrigins = (process.env.MINDMAP_BRIDGE_ORIGINS ?? 'http://localhost:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const bridge = new Bridge({ port, token, allowedOrigins, log });
  try {
    await bridge.start();
  } catch (e) {
    log(`cannot listen on 127.0.0.1:${port}: ${(e as Error).message}`);
    process.exit(1);
  }
  log(`bridge listening on ws://127.0.0.1:${port} for ${allowedOrigins.join(', ')}`);

  const server = new McpServer({ name: 'drawio-mindmap', version: VERSION });
  registerTools(server, bridge);
  await server.connect(new StdioServerTransport());

  const shutdown = async () => {
    await bridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('close', shutdown);
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
