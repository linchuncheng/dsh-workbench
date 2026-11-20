import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKBENCH_API_VERSION } from '@dsh-workbench/shared/host';
import { DEFAULT_FACES } from './faces.mjs';

const API_VERSION = WORKBENCH_API_VERSION;

export async function migrate({ root, args = [] }) {
  const dryRun = args.includes('--dry-run');
  const file = join(root, 'package.json');
  if (!existsSync(file)) {
    console.error(`这里没有 package.json：${root}`);
    process.exit(2);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`package.json 不是合法 JSON：${error.message}`);
    process.exit(2);
  }

  const dsh = manifest.dsh;
  const workbench = dsh?.workbench;
  if (workbench === undefined) {
    console.error('该包未声明 dsh.workbench：请先 cd 到模块目录再运行（或添加 --cwd <模块目录>）');
    process.exit(2);
  }

  const changes = [];
  if (workbench.apiVersion !== API_VERSION) {
    changes.push(`dsh.workbench.apiVersion：${JSON.stringify(workbench.apiVersion)} → ${String(API_VERSION)}`);
    workbench.apiVersion = API_VERSION;
  }

  if (dsh.workbenchFaces === undefined) {
    changes.push(`dsh.workbenchFaces：补充默认值 ${DEFAULT_FACES.host} / ${DEFAULT_FACES.client}`);
    dsh.workbenchFaces = { ...DEFAULT_FACES };
  } else {
    for (const [kind, fallback] of Object.entries(DEFAULT_FACES)) {
      if (typeof dsh.workbenchFaces[kind] === 'string' && dsh.workbenchFaces[kind] !== '') continue;
      changes.push(`dsh.workbenchFaces.${kind}：补充 ${fallback}`);
      dsh.workbenchFaces[kind] = fallback;
    }
  }

  for (const [kind, rel] of Object.entries(dsh.workbenchFaces)) {
    if (!existsSync(join(root, rel))) {
      console.warn(`⚠ workbenchFaces.${kind} 指向的 ${rel} 不存在 —— 请先创建该入口`);
    }
  }

  if (changes.length === 0) {
    console.log('已是当前版本：清单无需修改。');
  } else if (dryRun) {
    console.log(`将修改 ${String(changes.length)} 处（--dry-run 未写入）：`);
    for (const one of changes) console.log(`  · ${one}`);
  } else {
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`已修改 ${String(changes.length)} 处：`);
    for (const one of changes) console.log(`  · ${one}`);
  }

  if (workbench.card === null || workbench.card === undefined) {
    console.log('清单 card 为 null / 缺失：如果 client.js 实际登记了卡片，请运行 `check --only cards` 查看 —— 补充 `"card": { "order": … }` 或移除该卡片的登记。');
  }
  console.log('源码类迁移不会自动修改：`check` 会逐项指出（kit 成员、裸控件、apiVersion 之外的协议字段），请按提示修改源码。');
}
