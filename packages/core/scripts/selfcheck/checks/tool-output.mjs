import { sourceIndex } from '../lib.mjs';

const FUNNELS = new Map([
  ['modules/panels/model/tool-registry-guard.ts', '工作台自有工具'],
  ['kernel/host/mount-units.ts', 'unit 工具'],
]);

const READ_ONLY = new Map([
  ['shared/api/host/ai-adapter.ts', '只读视图：拿它凑 tool-call 预览，不注册'],
  ['shared/api/host/pack-scope.ts', '只读视图：按包收窄工具面，不注册'],
]);

const LOOKUP = /\bget\((['"])tools\1\)/u;
const TESTING = /(__tests__|\.test\.)/u;

function offenders() {
  const allowed = new Set([...FUNNELS.keys(), ...READ_ONLY.keys()]);
  return sourceIndex()
    .filter((one) => !TESTING.test(one.name))
    .filter((one) => LOOKUP.test(one.source))
    .map((one) => one.name)
    .filter((name) => !allowed.has(name));
}

function sourceNamed(name) {
  return sourceIndex().find((one) => one.name === name)?.source ?? '';
}

export const checks = [
  {
    title: '★ 工具输出的全局兜底靠两个注册漏斗，没有第三条旁路',
    run(_ctx, report) {
      const stray = offenders();
      const unguarded = [...FUNNELS.keys()].filter((name) => !sourceNamed(name).includes('names.add(') && !sourceNamed(name).includes('names?.add('));
      report(
        '★ 工具输出的全局兜底靠两个注册漏斗，没有第三条旁路',
        stray.length === 0 && unguarded.length === 0,
        [
          stray.length === 0 ? '' : `直接取 tools 的旁路：${stray.join(' / ')}`,
          unguarded.length === 0 ? '' : `漏斗没记账（输出预算认不出）：${unguarded.join(' / ')}`,
        ]
          .filter(Boolean)
          .join('；') || '两个漏斗都记账，没有旁路',
      );
    },
  },
  {
    title: '★ 整结果预算归平台：宿主侧不再手搓 PRUNE_CHARS 式的截断',
    run(_ctx, report) {
      const leftover = sourceIndex()
        .filter((one) => !TESTING.test(one.name))
        .filter((one) => one.source.includes('PRUNE_CHARS'))
        .map((one) => one.name);
      report(
        '★ 整结果预算归平台：宿主侧不再手搓 PRUNE_CHARS 式的截断',
        leftover.length === 0,
        leftover.length === 0 ? '只剩平台的 post-execute 策略' : `还有手搓截断：${leftover.join(' / ')}`,
      );
    },
  },
];
