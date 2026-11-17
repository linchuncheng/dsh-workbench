import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkVersionRange } from '@dsh-workbench/shared/host';
import { OPENCLI_NPM_PACKAGE, vendorPluginsDir } from '../foundation/paths.js';
import { jsonAt as jsonOf } from './json-file.js';

export interface PluginPeerProblem {
  readonly name: string;
  readonly range: string;
}

function packageDirs(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('@')) {
      found.push(join(root, entry.name));
      continue;
    }
    const scoped = join(root, entry.name);
    for (const inner of readdirSync(scoped, { withFileTypes: true })) {
      if (inner.isDirectory()) found.push(join(scoped, inner.name));
    }
  }
  return found;
}

export function pluginPeerProblems(pin: string): readonly PluginPeerProblem[] {
  const found: PluginPeerProblem[] = [];
  for (const dir of packageDirs(vendorPluginsDir())) {
    const manifest = jsonOf(join(dir, 'package.json'));
    const name = manifest?.['name'];
    if (typeof name !== 'string' || name.trim() === '') continue;
    const peers = manifest?.['peerDependencies'];
    const declared =
      typeof peers === 'object' && peers !== null
        ? (peers as Readonly<Record<string, unknown>>)[OPENCLI_NPM_PACKAGE]
        : undefined;
    const range = typeof declared === 'string' ? declared.trim() : '';
    if (range === '') continue;
    const verdict = checkVersionRange(range, pin);
    if (verdict === 'satisfied') continue;
    found.push({ name: name.trim(), range });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
