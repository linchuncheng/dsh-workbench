import { LIBRARY_DECISIONS } from './arch/library-decisions.mjs';
import { STACK_CAPABILITIES } from './arch/stack.mjs';

const DECISIONS = new Set(['adopt', 'defer']);
const MIN_REASON = 20;
const BASELINE = new Set([
  'atomic-state',
  'cli-args',
  'cli-locate',
  'datetime',
  'deep-clone',
  'deep-equal',
  'file-lock',
  'number-format',
  'process-spawn',
  'query-string',
  'semver',
  'unique-id',
]);

export function libraryDecisionProblems() {
  const problems = [];
  const seen = new Set();
  for (const entry of LIBRARY_DECISIONS) {
    const capability = typeof entry?.capability === 'string' ? entry.capability : '';
    if (capability === '') {
      problems.push('决策记录缺 capability');
      continue;
    }
    if (seen.has(capability)) problems.push(`能力 ${capability} 的决策记录重复`);
    seen.add(capability);
    if (!Array.isArray(entry.candidates) || entry.candidates.length === 0) {
      problems.push(`能力 ${capability} 没写候选`);
    }
    if (!DECISIONS.has(entry.decision)) {
      problems.push(`能力 ${capability} 的 decision 只能是 adopt 或 defer`);
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < MIN_REASON) {
      problems.push(`能力 ${capability} 没写清理由（至少 ${String(MIN_REASON)} 字）`);
    }
    const registered = Object.hasOwn(STACK_CAPABILITIES, capability);
    if (entry.decision === 'adopt' && !registered) {
      problems.push(`能力 ${capability} 记的是 adopt，但 STACK_CAPABILITIES 里没有它`);
    }
    if (entry.decision === 'defer' && registered) {
      problems.push(`能力 ${capability} 记的是 defer，但仍登记在 STACK_CAPABILITIES 里`);
    }
  }
  for (const capability of Object.keys(STACK_CAPABILITIES)) {
    if (BASELINE.has(capability) || seen.has(capability)) continue;
    problems.push(`能力 ${capability} 没有决策记录（加进 scripts/arch/library-decisions.mjs）`);
  }
  return problems;
}
