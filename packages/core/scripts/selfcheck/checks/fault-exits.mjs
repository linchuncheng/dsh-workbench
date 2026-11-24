import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { read, SHARED_SRC, SRC, walk } from '../lib.mjs';

const SURFACE_ROWS = [
  '启动页兜底卡|core|app/layouts/env-gate/fault-card.ts|mode: \'fallback\'|prompt:',
  '启动页兜底卡的出口按钮|core|app/layouts/env-gate/fallback-section.ts|askAgent.copy|writeClipboard',
  '模块卡阻断|shared|api/blocker-table.ts|ask-agent|askAgentActionOf',
  '看板读失败|core|app/layouts/rightbar/BoardReadFailed.tsx|askAgentActionOf',
  '卡片渲染崩溃|shared|components/card/CardBoundary.tsx|askAgent.copy|askAgent.copied',
  '客户端入口失败|core|shared/components/EntryBoundary.tsx|askAgent.copy|entryPromptOf',
  '模块市场失败卡|core|app/layouts/rightbar/failure-card-text.ts|panels.market.failure.askAgent',
];

const SURFACES = SURFACE_ROWS.map((row) => {
  const [name, root, rel, ...exits] = row.split('|');
  return { name, file: join(root === 'shared' ? SHARED_SRC : SRC, rel), exits };
});

const REGISTERED = new Set(SURFACES.map((surface) => surface.file));
const TYPE_ONLY = new Set([join(SHARED_SRC, 'contract/blocker.ts')]);

function faultSurfaceFiles() {
  const dirs = [SRC, SHARED_SRC];
  return dirs
    .flatMap((dir) => walk(dir))
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter((file) => {
      const source = read(file);
      return source.includes("severity: 'block'") || source.includes("mode: 'fallback'");
    });
}

export const checks = [
  {
    title: '★ 每个故障面都登记了出口（确定性动作或复制给 agent）——没登记的故障面不许出现',
    run(_ctx, report) {
      const found = faultSurfaceFiles();
      const missing = found.filter((file) => !REGISTERED.has(file) && !TYPE_ONLY.has(file));
      const gone = SURFACES.filter((surface) => !existsSync(surface.file));
      report(
        '★ 每个故障面都登记了出口（确定性动作或复制给 agent）——没登记的故障面不许出现',
        missing.length === 0 && gone.length === 0,
        missing.length === 0 && gone.length === 0
          ? `故障面 ${String(found.length)} 处都登记了`
          : `没登记：${missing.join(' · ')}；找不到：${gone.map((one) => one.name).join(' · ')}`,
      );
    },
  },
  {
    title: '★ 登记过的故障面真的带着出口（把「复制给 agent」删掉就红）',
    run(_ctx, report) {
      const broken = SURFACES.filter((surface) => {
        const source = read(surface.file);
        return surface.exits.some((token) => !source.includes(token));
      });
      report(
        '★ 登记过的故障面真的带着出口（把「复制给 agent」删掉就红）',
        broken.length === 0,
        broken.length === 0
          ? SURFACES.map((surface) => surface.name).join(' · ')
          : `缺出口：${broken
              .map((surface) => `${surface.name} 缺 ${surface.exits.filter((token) => !read(surface.file).includes(token)).join(' / ')}`)
              .join(' · ')}`,
      );
    },
  },
];
