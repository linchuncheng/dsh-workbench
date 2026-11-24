import { readFileSync } from 'node:fs';
import type { ExtensionNeed, LibNeed, Need } from '../../contract/needs.js';

export function builtinCommandsOf(file: string): ReadonlyMap<string, readonly string[]> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return new Map();
    const bySite = new Map<string, string[]>();
    for (const one of parsed) {
      if (typeof one !== 'object' || one === null) continue;
      const row = one as Record<string, unknown>;
      const site = typeof row['site'] === 'string' ? row['site'] : '';
      const name = typeof row['name'] === 'string' ? row['name'] : '';
      if (site === '' || name === '') continue;
      const list = bySite.get(site) ?? [];
      list.push(name);
      for (const alias of Array.isArray(row['aliases']) ? row['aliases'] : []) {
        if (typeof alias === 'string' && alias !== '') list.push(alias);
      }
      bySite.set(site, list);
    }
    return bySite;
  } catch {
    return new Map();
  }
}

export function builtinMissingOf(
  needs: readonly Need[] | undefined,
  catalog: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  return (needs ?? [])
    .filter((need): need is ExtensionNeed | LibNeed => need.kind === 'extension' || need.kind === 'lib')
    .filter((need) => (need.sources ?? []).some((source) => source.kind === 'builtin'))
    .filter((need) => {
      const commands = catalog.get(need.name);
      if (commands === undefined) return true;
      if (need.kind !== 'extension') return false;
      return (need.commands ?? []).some((name) => !commands.includes(name));
    })
    .map((need) => need.name);
}
