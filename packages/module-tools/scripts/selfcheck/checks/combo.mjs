import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FACES, declaration, runCheck } from '../lib.mjs';

function manifestOf(name, unit, options = {}) {
  return `${JSON.stringify(
    {
      name,
      version: '0.0.1',
      private: options.private === true,
      type: 'module',
      peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
      scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
      dsh: {
        ...(options.bundle === true ? { bundle: { patch: './cordis.patch.yml' } } : {}),
        client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
        workbench: declaration(unit),
        workbenchFaces: FACES,
      },
    },
    null,
    2,
  )}\n`;
}

export const checks = [
  {
    title:
      '组合包声明：可发布的工作台模块声明 dsh.bundle 判红（点名该字段）；去掉它变绿；private 包跳过不判',
    run(_ctx, report) {
      const title =
        '组合包声明：可发布的工作台模块声明 dsh.bundle 判红（点名该字段）；去掉它变绿；private 包跳过不判';
      const shop = mkdtempSync(join(tmpdir(), 'dsh-wb-combo-'));
      const pkgDir = join(shop, 'packages', 'combo-module');
      mkdirSync(pkgDir, { recursive: true });
      const write = (text) => writeFileSync(join(pkgDir, 'package.json'), text, 'utf8');
      const run = () => runCheck(pkgDir, 'combo', shop);

      try {
        write(manifestOf('@neg/combo', 'combo', { bundle: true }));
        const red = run();
        if (!red.failed) throw new Error('可发布的模块声明了 dsh.bundle，combo 却没判红');
        if (!red.out.includes('dsh.bundle')) throw new Error(`判红了但没点名 dsh.bundle：\n${red.out}`);

        write(manifestOf('@neg/combo', 'combo'));
        const green = run();
        if (green.failed) throw new Error(`去掉 dsh.bundle 之后仍然判红：\n${green.out}`);
        if (!green.out.includes('都没有声明 dsh.bundle')) {
          throw new Error(`变绿了但没说清检查了几个包：\n${green.out}`);
        }

        write(manifestOf('@neg/combo', 'combo', { bundle: true, private: true }));
        const skipped = run();
        if (skipped.failed) throw new Error(`private 包不该判红：\n${skipped.out}`);
        if (!skipped.out.includes('（不适用）')) throw new Error(`private 包应当报「不适用」：\n${skipped.out}`);

        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 300));
      } finally {
        rmSync(shop, { recursive: true, force: true });
      }
    },
  },
];
