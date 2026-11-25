import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execaSync } from 'execa';

import { runProbe, BIN } from '../lib.mjs';

const TITLE = '--package 按模块 scope：兄弟模块的单模块红不挡，工作区级不变量仍挡';

const manifestOf = (name, unit) =>
  JSON.stringify(
    {
      name,
      version: '0.0.0',
      private: true,
      type: 'module',
      scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
      peerDependencies: { '@dsh-workbench/core': '^1.5.4' },
      dsh: {
        workbench: {
          apiVersion: 3,
          unit,
          title: { zh: '演示', en: 'Demo' },
          card: null,
          tools: [],
          host: { inject: [] },
        },
        workbenchFaces: { host: 'src/host.ts', client: 'src/client.tsx' },
      },
    },
    null,
    2,
  );

const hostOf = (unit) =>
  `export function apply(ctx) { ctx.effect(() => { ctx.get('workbenchUnits')?.register({ unit: '${unit}', mount: () => ({ registerTools: () => [] }) }); }); }\n`;

function writeModule(root, name, unit, { built }) {
  const dir = join(root, 'packages', name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${manifestOf(`@probe/${name}`, unit)}\n`);
  writeFileSync(join(dir, 'src/host.ts'), '');
  writeFileSync(join(dir, 'src/client.tsx'), '');
  if (built) {
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'dist/host.js'), hostOf(unit));
  }
}

function run(root, args, env = {}) {
  const result = execaSync(process.execPath, [BIN, 'check', ...args, '--cwd', root], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    reject: false,
  });
  return { code: result.exitCode ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const workspace = mkdtempSync(join(tmpdir(), 'dsh-wb-scope-'));
      const problems = [];
      runProbe(workspace, problems, () => {
        writeFileSync(join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
        writeModule(workspace, 'one', 'one', { built: true });
        writeModule(workspace, 'two', 'two', { built: false });

        const clean = run(workspace, ['--only', 'contracts', '--package', '@probe/one']);
        if (clean.code !== 0) {
          problems.push(`兄弟模块的单模块红挡住了本模块：\n${clean.out.slice(0, 400)}`);
        }
        if (clean.out.includes('@probe/two')) {
          problems.push('scoped 输出里出现了兄弟模块的问题');
        }

        const full = run(workspace, ['--only', 'contracts']);
        if (full.code === 0) problems.push('全量检查把兄弟模块的红翻成了绿');
        if (!full.out.includes('@probe/two')) problems.push('全量检查没有报兄弟模块的问题');

        const self = run(workspace, ['--only', 'contracts', '--package', '@probe/two']);
        if (self.code === 0) problems.push('本模块自己的红被 scope 吃掉了');

        const config = run(workspace, ['--only', 'markers', '--package', '@probe/one'], {
          DSH_WB_INTERNAL_MARKERS: 'not-json',
        });
        if (config.code === 0) problems.push('全局配置错被 --package 翻成了绿');
        if (!/internal-markers|标记|JSON/i.test(config.out)) {
          problems.push(`没有把全局错报出来：${config.out.slice(0, 200)}`);
        }

        writeModule(workspace, 'two', 'one', { built: true });
        const invariant = run(workspace, ['--only', 'contracts', '--package', '@probe/one']);
        if (invariant.code === 0) problems.push('单元 id 重复没有挡住 scoped 检查');
        if (!invariant.out.includes('单元 id') || !invariant.out.includes('重复')) {
          problems.push(`工作区级不变量没有报出来：${invariant.out.slice(0, 300)}`);
        }
      });
      report(TITLE, problems.length === 0, problems.join(' · '));
    },
  },
];
