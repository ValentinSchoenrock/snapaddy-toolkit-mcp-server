import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const API_KEY_FILE = join(homedir(), '.snapaddy-mcp', 'api-key.json');

export function readStoredApiKey(): string | undefined {
  if (!existsSync(API_KEY_FILE)) return undefined;
  try {
    const data = JSON.parse(readFileSync(API_KEY_FILE, 'utf8'));
    return typeof data.apiKey === 'string' ? data.apiKey.trim() || undefined : undefined;
  } catch {
    return undefined;
  }
}

export function storeApiKey(key: string): void {
  mkdirSync(dirname(API_KEY_FILE), { recursive: true });
  writeFileSync(API_KEY_FILE, JSON.stringify({ apiKey: key }), { mode: 0o600 });
  try {
    chmodSync(API_KEY_FILE, 0o600);
  } catch {
    // not supported on every platform
  }
}
