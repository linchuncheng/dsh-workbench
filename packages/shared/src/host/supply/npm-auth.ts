import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { npmrcEntries } from './npmrc.js';

interface ScopedAuth {
  readonly prefix: string;
  readonly fields: ReadonlyMap<string, string>;
}

const AUTH_FIELDS: ReadonlySet<string> = new Set(['_authToken', '_auth', 'username', '_password']);

function userConfigPath(): string {
  const upper = process.env['NPM_CONFIG_USERCONFIG']?.trim() ?? '';
  const lower = process.env['npm_config_userconfig']?.trim() ?? '';
  if (upper !== '') return upper;
  if (lower !== '') return lower;
  return join(homedir(), '.npmrc');
}

function unquote(value: string): string {
  const first = value.at(0);
  if (value.length < 2 || (first !== '"' && first !== "'") || value.at(-1) !== first) return value;
  return value.slice(1, -1);
}

function expandEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (whole: string, name: string) => process.env[name] ?? whole);
}

function normalizedPrefix(prefix: string): string {
  const slash = prefix.indexOf('/', 2);
  if (slash < 0) return `//${prefix.slice(2).toLowerCase()}/`;
  const host = prefix.slice(0, slash).toLowerCase();
  const path = prefix.slice(slash);
  return `${host}${path.endsWith('/') ? path : `${path}/`}`;
}

function scopedAuthOf(text: string): readonly ScopedAuth[] {
  const scopes = new Map<string, Map<string, string>>();
  for (const entry of npmrcEntries(text)) {
    const { key } = entry;
    if (!key.startsWith('//')) continue;
    const fieldAt = key.lastIndexOf(':');
    if (fieldAt <= 2) continue;
    const field = key.slice(fieldAt + 1);
    if (!AUTH_FIELDS.has(field)) continue;
    const value = expandEnv(unquote(entry.value));
    if (value === '') continue;
    const prefix = normalizedPrefix(key.slice(0, fieldAt));
    const fields = scopes.get(prefix) ?? new Map<string, string>();
    fields.set(field, value);
    scopes.set(prefix, fields);
  }
  return [...scopes].map(([prefix, fields]) => ({ prefix, fields }));
}

function decodedPassword(value: string): string {
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  return decoded === '' ? value : decoded;
}

function authorizationOf(fields: ReadonlyMap<string, string>): string | undefined {
  const token = fields.get('_authToken');
  if (token !== undefined) return `Bearer ${token}`;
  const auth = fields.get('_auth');
  if (auth !== undefined) return `Basic ${auth}`;
  const username = fields.get('username');
  const password = fields.get('_password');
  if (username === undefined || password === undefined) return undefined;
  return `Basic ${Buffer.from(`${username}:${decodedPassword(password)}`).toString('base64')}`;
}

function userConfigText(): string {
  try {
    return readFileSync(userConfigPath(), 'utf8');
  } catch {
    return '';
  }
}

export function authHeaderOf(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  const target = `//${parsed.host.toLowerCase()}${parsed.pathname}`;
  const matches = scopedAuthOf(userConfigText())
    .filter((scope) => target === scope.prefix || target.startsWith(scope.prefix))
    .sort((left, right) => right.prefix.length - left.prefix.length);
  for (const scope of matches) {
    const authorization = authorizationOf(scope.fields);
    if (authorization !== undefined) return authorization;
  }
  return undefined;
}
