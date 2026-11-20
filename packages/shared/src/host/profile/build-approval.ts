import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAlias, isMap, isNode, isScalar, parseDocument, visit } from 'yaml';
import { writeTextFile } from '../runtime/fs-write.js';

const UNDECIDED = 'set this to true or false';

const IGNORED_BUILDS = /\bIgnored build scripts: (.+)/;

const GIT_DEP_PREPARE = /ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED[\s\S]*?^allowBuilds:\r?\n[ \t]+(.+?): true$/m;

function carriesCredential(key: string): boolean {
  const at = key.indexOf('@git+');
  if (at === -1) return false;
  const url = URL.parse(key.slice(at + '@git+'.length).replace(/#.*$/s, ''));
  return url !== null && (url.password !== '' || (url.username !== '' && /^https?:$/.test(url.protocol)));
}

function policyPath(profileDir: string): string {
  return join(profileDir, 'pnpm-workspace.yaml');
}

function readPolicy(profileDir: string) {
  let text: string;
  try {
    text = readFileSync(policyPath(profileDir), 'utf8');
  } catch {
    text = '{}\n';
  }
  const document = parseDocument(text);
  if (document.errors[0] !== undefined) throw document.errors[0];
  if (!isMap(document.contents)) throw new Error('profile 的 pnpm-workspace.yaml 不是一份 YAML 映射');
  const builds = document.get('allowBuilds');
  if (builds !== undefined && !isMap(builds)) throw new Error('pnpm-workspace.yaml 里的 allowBuilds 必须是映射');
  visit(builds ?? null, (_key, node) => {
    if (isAlias(node) || (isNode(node) && 'anchor' in node && node.anchor)) {
      throw new Error('pnpm-workspace.yaml 的 allowBuilds 不许用 YAML 锚点或别名');
    }
  });
  const entries = isMap(builds) ? builds.items : [];
  const names = entries.flatMap(({ key }) => (isScalar(key) && typeof key.value === 'string' ? [key.value] : []));
  const pending = entries.flatMap(({ key, value }) =>
    isScalar(key) && typeof key.value === 'string' && !/[*?]/.test(key.value) && isScalar(value) && value.value === UNDECIDED
      ? [key.value]
      : [],
  );
  return { document, names, pending };
}

export function blockedBuildNames(output: string): readonly string[] {
  const ignored = IGNORED_BUILDS.exec(output)?.[1]?.split(',') ?? [];
  const git = GIT_DEP_PREPARE.exec(output)?.[1];
  const names = [...ignored, ...(git === undefined ? [] : [git])].map((name) => name.trim());
  return [...new Set(names.filter((name) => name !== '' && !/[*?]/.test(name) && !carriesCredential(name)))];
}

export function pendingBuildsOf(profileDir: string | null): readonly string[] {
  if (profileDir === null) return [];
  try {
    return readPolicy(profileDir).pending;
  } catch {
    return [];
  }
}

export function recordPendingBuilds(profileDir: string | null, output: string): readonly string[] {
  if (profileDir === null) return [];
  const found = blockedBuildNames(output);
  if (found.length === 0) return pendingBuildsOf(profileDir);
  const { document, names, pending } = readPolicy(profileDir);
  const known = new Set(names);
  const added = found.filter((name) => !known.has(name));
  if (added.length === 0) return pending;
  for (const name of added) document.setIn(['allowBuilds', name], UNDECIDED);
  writeTextFile(policyPath(profileDir), `${String(document)}\n`, { mode: 0o600 });
  return [...pending, ...added];
}

export function approveBuilds(profileDir: string | null, names: readonly string[]): void {
  if (profileDir === null || names.length === 0) return;
  const { document, pending } = readPolicy(profileDir);
  const stale = names.filter((name) => !pending.includes(name));
  if (stale.length > 0) {
    throw new Error(`这些构建没有在等待批准：${stale.join('、')}。重新安装一次，看最新的待批清单`);
  }
  for (const name of names) document.setIn(['allowBuilds', name], true);
  writeTextFile(policyPath(profileDir), `${String(document)}\n`, { mode: 0o600 });
}
