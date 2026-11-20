import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CHANGELOG_FILE,
  changelogDate,
  changelogHasEntry,
  changelogVersion,
  isValidVersion,
  planChangelog,
} from '@dsh-workbench/shared/host';

const USAGE = `用法：
  changelog check [版本]   检查该版本是否有记录（省略版本时使用 package.json 中的版本）
发布时写入该版本：release --changelog-note "这一版改了什么"（文件不存在时会先创建）`;

function positional(args, at) {
  const value = args[at];
  return value === undefined || value.startsWith('--') ? undefined : value;
}

export function changelogFileOf(root) {
  return join(root, CHANGELOG_FILE);
}

export function readChangelogText(root) {
  try {
    return readFileSync(changelogFileOf(root), 'utf8');
  } catch {
    return '';
  }
}

export function manifestVersionOf(root) {
  try {
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    return typeof version === 'string' ? version.trim() : '';
  } catch {
    return '';
  }
}

export function changelogProblemOf(root, version) {
  const text = readChangelogText(root);
  if (text.trim() === '') {
    return {
      reason: `包中还没有 ${CHANGELOG_FILE} —— 更新日志需要随包发布`,
      command: 'dsh-wb-module release --yes --changelog-note "这一版改了什么"',
    };
  }
  if (!changelogHasEntry(text, version)) {
    return {
      reason: `${CHANGELOG_FILE} 中没有 ${version} 这一版的内容 —— 发布时请写入该版本`,
      command: 'dsh-wb-module release --yes --changelog-note "这一版改了什么"',
    };
  }
  return undefined;
}

export class ChangelogError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = 'ChangelogError';
    this.code = code;
  }
}

export function applyChangelog(root, { version, kind = 'changed', note, date }) {
  const wanted = changelogVersion(version === undefined || version === '' ? manifestVersionOf(root) : version);
  if (!isValidVersion(wanted)) {
    throw new ChangelogError(`版本必须写成 x.y.z（收到「${String(version)}」）—— 也可以省略，使用 package.json 中的版本`);
  }
  const plan = planChangelog(readChangelogText(root), {
    version: wanted,
    kind,
    note: note ?? '',
    date: date ?? changelogDate(),
  });
  if (plan === undefined) return undefined;
  if (plan.action === 'written') writeFileSync(changelogFileOf(root), plan.text);
  return { ...plan, file: changelogFileOf(root) };
}

function runCheck(root, args) {
  const version = changelogVersion(positional(args, 1) ?? manifestVersionOf(root));
  if (!isValidVersion(version)) {
    console.error('changelog check 需要确定检查哪个版本：请提供 x.y.z，或先让 package.json 包含 version');
    process.exit(2);
  }
  const problem = changelogProblemOf(root, version);
  if (args.includes('--json')) {
    console.log(
      JSON.stringify(
        problem === undefined
          ? { ok: true, version }
          : { ok: false, version, reason: problem.reason, command: problem.command },
      ),
    );
  } else if (problem === undefined) {
    console.log(`✔ ${CHANGELOG_FILE} 里有 ${version} 的更新日志`);
  } else {
    console.error(`✖ ${problem.reason}`);
    console.error(`  补充命令：${problem.command}`);
  }
  if (problem !== undefined) process.exit(1);
}

export async function changelog({ root, args = [] }) {
  const sub = args[0];
  if (sub === 'check') return runCheck(root, args);
  console.error(`无法识别的 changelog 子命令：${String(sub)}`);
  console.error(USAGE);
  process.exit(2);
}
