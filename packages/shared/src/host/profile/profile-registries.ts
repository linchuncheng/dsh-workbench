import type { RegistryEntry, RegistryNotebook } from '../adapters/adapter-types.js';
import { normalizeRegistry, sameRegistry, scopeOf } from '../adapters/adapter-types.js';
import fs from 'node:fs';
import path from 'node:path';
import { writeTextFile } from '../runtime/fs-write.js';
import { lockEntriesOf } from '../supply/pnpm-lock.js';
export const REGISTRY_MARKER =
  '# dsh-workbench 写的：这一行的包只在这个源上（dsh 卸载没有源参数，pnpm 得问得到）';

export function sourcesFromLockfile(text: string): readonly RegistryEntry[] {
  const found = new Map<string, string | null>();
  for (const entry of lockEntriesOf(text)) {
    if (entry.registry === undefined) continue;
    const scope = scopeOf(entry.name);
    if (scope === null) continue;
    const root = normalizeRegistry(entry.registry);
    const seen = found.get(scope);
    if (seen === undefined) found.set(scope, root);
    else if (!sameRegistry(seen, root)) found.set(scope, null);
  }
  return [...found.entries()]
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([scope, registry]) => ({ scope, registry }));
}

export interface RegistryConfigMerge {
  readonly text: string;
  readonly added: readonly string[];
}

export function mergeRegistryConfig(text: string, entries: readonly RegistryEntry[]): RegistryConfigMerge {
  const lines = text.split('\n');
  const present = (key: string): boolean => lines.some((line) => line.trim().startsWith(`${key}=`));
  const appended: string[] = [];
  const added: string[] = [];
  for (const entry of entries) {
    const key = `${entry.scope}:registry`;
    if (entry.registry.trim() === '' || present(key)) continue;
    lines.push(`${key}=${normalizeRegistry(entry.registry)}`);
    appended.push(`${key}=${normalizeRegistry(entry.registry)}`);
    added.push(key);
  }
  if (appended.length === 0) return { text, added: [] };
  const base = text === '' ? '' : text.endsWith('\n') ? text : `${text}\n`;
  const marker = base.includes(REGISTRY_MARKER) ? '' : `${REGISTRY_MARKER}\n`;
  return { text: `${base}${marker}${appended.join('\n')}\n`, added };
}

export function replaceScopeRegistry(text: string, scope: string, registry: string): string {
  const key = `${scope}:registry`;
  const value = normalizeRegistry(registry);
  let found = false;
  const lines = text.split('\n').map((line) => {
    if (!line.trim().startsWith(`${key}=`)) return line;
    found = true;
    return `${key}=${value}`;
  });
  if (found) return lines.join('\n');
  const base = text === '' ? '' : text.endsWith('\n') ? text : `${text}\n`;
  return `${base}${key}=${value}\n`;
}

function readNpmrc(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function writeNpmrc(file: string, text: string): void {
  writeTextFile(file, text, { mode: 0o600 });
}

export function createRegistryNotebook(dir: string | null): RegistryNotebook {
  return {
    sources() {
      if (dir === null) return [];
      try {
        return sourcesFromLockfile(fs.readFileSync(path.join(dir, 'pnpm-lock.yaml'), 'utf8'));
      } catch {
        return [];
      }
    },
    remember(entries) {
      if (dir === null || entries.length === 0) return [];
      const file = path.join(dir, '.npmrc');
      const merged = mergeRegistryConfig(readNpmrc(file), entries);
      if (merged.added.length === 0) return [];
      writeNpmrc(file, merged.text);
      return merged.added;
    },
    swapScope(scope, registry) {
      if (dir === null || scope.trim() === '' || registry.trim() === '') return () => {};
      const file = path.join(dir, '.npmrc');
      const key = `${scope.trim()}:registry`;
      const value = normalizeRegistry(registry);
      const before = readNpmrc(file);
      const previous = before.split('\n').find((line) => line.trim().startsWith(`${key}=`));
      const after = replaceScopeRegistry(before, scope.trim(), registry);
      if (after === before) return () => {};
      writeNpmrc(file, after);
      return () => {
        const now = readNpmrc(file);
        if (now === after) {
          if (before === '') fs.rmSync(file, { force: true });
          else writeNpmrc(file, before);
          return;
        }
        if (!now.includes(`${key}=${value}`)) return;
        const restored =
          previous === undefined
            ? now.split('\n').filter((line) => !line.trim().startsWith(`${key}=`)).join('\n')
            : now.replace(`${key}=${value}`, previous);
        writeNpmrc(file, restored);
      };
    },
  };
}
