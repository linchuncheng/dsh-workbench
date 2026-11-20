import { createRule } from '@arch-guard/core';
import { designSystem, i18n, library, noneI18nKit } from '@arch-guard/core/presets';
import { kernelRules } from './arch/rules/kernel.mjs';
import { stackDeps } from '../../scripts/arch/stack.mjs';
import { testsLiveInFolders } from '../../scripts/arch/rules/tests-in-folders.mjs';

const entryKeepsHostOut = createRule({
  id: 'S70',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '浏览器入口不许带出宿主侧',
  hint: 'src/index.ts 是浏览器半侧的入口，只能带 browser-safe 的东西；宿主侧走 src/host.ts。',
  run(ctx) {
    const facts = ctx.facts.get('src/index.ts');
    if (facts === undefined) return [];
    return (facts.imports ?? [])
      .filter((fact) => /(^|\/)host(\/|$)/.test(fact.spec))
      .map((fact) => ({
        rule: 'S70',
        file: 'src/index.ts',
        line: fact.line,
        text: `浏览器入口带出了宿主侧：${fact.spec}`,
        hint: '把它挪到 src/host.ts 那一侧（宿主入口）',
      }));
  },
});

export default {
  sourceForm: 'react',
  presets: [
    library({
      src: 'src',
      entry: ['index.ts', 'host.ts', 'testing.ts'],
      modules: {
        client: 2,
        contract: 1,
        lib: 2,
        config: 2,
        i18n: 2,
        api: 4,
        components: 3,
        '__tests__': 99,
        host: 9,
        testing: 99,
      },
    }),
    designSystem({

      styleDir: 'src/components',
      externalTokens: [
        { prefix: '--dsw-', provider: '@deepseek-ai/dsh-client-ui-theme' },
        { prefix: '--ds-', provider: '@deepseek-ai/dsh-client-ui-theme' },
        { prefix: '--wb-', provider: '@dsh-workbench/core' },
      ],
      storageFile: 'src/config/storage.ts',
      tokenDir: '',
      vendorDir: '',
      paletteFile: '',
      themeFile: '',
      valueWhitelists: [
        { rule: 'D12', allow: ['0'] },
        { rule: 'D13', allow: ['0'] },
        { rule: 'D14', allow: ['0'] },
      ],
    }),
    stackDeps(),
    i18n(noneI18nKit()),
  ],
  overrides: {
    include: ['src/**'],
    structure: {
      directoryItemLimits: [
        { role: 'lib:components', max: 21 },
        { role: 'lib:contract', max: 25 },
      ],
    },
    customRules: [entryKeepsHostOut, ...kernelRules, testsLiveInFolders],
    exceptions: [
      {
        rule: 'S16',
        glob: 'src/i18n/*.ts',
        reason: '词典是逐条文案的平铺表：拆文件只会让键名与语种漂开，检查的是键集不是文件体积。',
      },
      {
        rule: 'P06',
        glob: 'src/host/runtime/fs-write.ts',
        reason:
          'writeTextFileExclusive 是唯一写入口的“只在不存在时创建”，不是 file-lock 协议；' +
          '宿主租约用它保证每个窗口的租约文件名唯一。',
      },
      {
        rule: 'P06',
        glob: 'src/host/runtime/process-alive.ts',
        reason: '这里只问进程号还在不在（kill(pid, 0)），既不开文件也不持锁。',
      },
    ],
  },
};
