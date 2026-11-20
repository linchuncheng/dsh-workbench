import { join } from 'node:path';
import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import { dshHome, hostSurface, readTokens, seamOf, supplyPortOf } from '@dsh-workbench/shared/host';
import {
  DEPS_SURFACE,
  findFileOf,
  refusesEvery,
  renderNameText,
  renderSurfaceText,
  runSurfaceQuery,
  scopeOf,
  toolchainBinOf,
  TWO_FACE_ALL,
  wantsKit,
  wantsPrimitives,
  type SurfaceQuery,
} from '@/shared/api/host/diy-surface';
import { renderTokensText } from '@/shared/api/host/diy-tokens';
import { workshopPathOf } from '@/shared/api/host/diy';
import { asRecord, asText, moduleDirsOf, OUTPUT, plainJson, workspaceOf } from './diy-context';
import { DIY_SURFACE_TOOL } from '../unit';

export function surfaceTool(ctx: DshHostContext): DshToolDefinition {
  return {
    name: DIY_SURFACE_TOOL,
    description:
      '查询工作台提供的能力：kit、原语、令牌、dsh 进程能力与 deps。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '要查询的名称（如 Card；以 --dsw- 开头时连同取值返回）。' },
        scope: { type: 'string', enum: ['kit', 'primitives', 'tokens', 'platform', 'deps'], description: 'kit=组件 / primitives=原语 / tokens=令牌 / platform=dsh 进程能力 / deps=依赖；默认 kit 与 primitives。' },
        bucket: { type: 'string', description: '只列某一分组并展开全部（例 components）。' },
        all: { type: 'boolean', description: '列出全表；默认每组前 12 个。' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const args = asRecord(raw);
      const scope = scopeOf(asText(args['scope']));
      const name = asText(args['name']);
      const bucket = asText(args['bucket']);
      const all = args['all'] === true;
      if (scope === 'deps') {
        const text = ['宿主 deps（UnitMountDeps）：', ...Object.entries(DEPS_SURFACE).map(([name, detail]) => `${name}: ${detail}`)].join('\n');
        return plainJson({ workspace: root, scope, name, bucket, all, deps: DEPS_SURFACE, text });
      }
      if (scope === 'platform') {
        const capabilities = hostSurface().capabilities;
        const text = [
          '宿主能力（不返回 OS）：',
          `fileManager: ${capabilities.fileManager}`,
          `pageDebug: ${String(capabilities.pageDebug)}`,
          `recording: ${String(capabilities.recording)}`,
          `browserWake: ${String(capabilities.browserWake)}`,
          `selfUpdateCli: ${capabilities.selfUpdateCli}`,
          `safeMode: ${String(capabilities.safeMode)}`,
        ].join('\n');
        return plainJson({ workspace: root, scope, name, bucket, all, capabilities, text });
      }
      if (scope === 'tokens' || name.startsWith('--')) {
        const profile = supplyPortOf(ctx).profileDirOf(ctx);
        const dirs = [
          profile ?? '',
          join(dshHome(), 'profiles'),
          workshopPathOf(ctx) ?? '',
          root,
          ...moduleDirsOf(root),
        ];
        const tokens = readTokens(dirs);
        const text = renderTokensText(tokens, { name, bucket, all, searched: dirs });
        return plainJson({
          workspace: root,
          scope: 'tokens',
          name,
          bucket,
          all,
          tokens: {
            dsw: tokens.dsw === null ? null : { version: tokens.dsw.version, file: tokens.dsw.file, count: tokens.dsw.entries.length },
            wb: tokens.wb === null ? null : { version: tokens.wb.version, file: tokens.wb.file, count: tokens.wb.entries.length },
          },
          text,
        });
      }
      if (name === '' && refusesEvery(scope, all, bucket !== '')) {
        return plainJson({
          workspace: root,
          scope,
          name,
          bucket,
          all,
          file: null,
          from: null,
          primitives: null,
          kit: null,
          text: TWO_FACE_ALL,
        });
      }
      const shellRoot = workshopPathOf(ctx);
      const shellBin = shellRoot === null ? null : toolchainBinOf(shellRoot);
      const local =
        [root, ...moduleDirsOf(root)]
          .map((dir) => ({ dir, bin: toolchainBinOf(dir) }))
          .find((one) => one.bin !== null) ?? null;
      const bin = local?.bin ?? shellBin;
      if (bin === null) {
        throw new Error(
          `当前工作区及其模块中都没有 dsh-wb-module（${join(root, 'node_modules')} 下不存在）。` +
            '在该目录执行一次 pnpm install 即可；workbench_diy_status 会说明停在哪一步',
        );
      }
      const seam = seamOf(ctx);
      if (seam === undefined) throw new Error('本机没有 shell 服务，无法读取组件清单');

      const workdir = local?.dir ?? shellRoot ?? root;
      const fallbackBin = local !== null && shellBin !== null && shellBin !== bin ? shellBin : undefined;
      const [primitives, kit] = await Promise.all([
        wantsPrimitives(scope)
          ? runSurfaceQuery(seam, bin, 'primitives', workdir, fallbackBin)
          : Promise.resolve(undefined),
        wantsKit(scope) ? runSurfaceQuery(seam, bin, 'kit', workdir, fallbackBin) : Promise.resolve(undefined),
      ]);
      const query: SurfaceQuery = {
        ...(primitives === undefined ? {} : { primitives }),
        ...(kit === undefined ? {} : { kit }),
      };
      const found = name === '' ? null : findFileOf(name, query);
      const text = name === '' ? renderSurfaceText(query, { scope, all, bucket }) : renderNameText(name, found, query);
      return plainJson({
        workspace: root,
        scope,
        name,
        bucket,
        all,
        file: found?.file ?? null,
        from: found?.from ?? null,
        primitives: primitives ?? null,
        kit: kit ?? null,
        text,
      });
    },
  };
}

export function registerSurfaceTool(ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  return [tools.register(surfaceTool(ctx))];
}
