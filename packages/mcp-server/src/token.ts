// The shared secret between this server and the plugin. Created once with mode 0600;
// MINDMAP_BRIDGE_TOKEN overrides it (CI, tests).
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_TOKEN_FILE = join(homedir(), '.config', 'drawio-mindmap', 'bridge-token');

export function loadOrCreateToken(
  file = process.env.MINDMAP_BRIDGE_TOKEN_FILE ?? DEFAULT_TOKEN_FILE,
): string {
  const fromEnv = process.env.MINDMAP_BRIDGE_TOKEN;
  if (fromEnv != null && fromEnv.length > 0) return fromEnv;
  if (existsSync(file)) {
    const token = readFileSync(file, 'utf8').trim();
    if (token.length >= 16) return token;
  }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const token = randomBytes(24).toString('base64url');
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return token;
}
