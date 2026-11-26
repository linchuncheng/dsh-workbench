import { join } from 'node:path';
import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import { dshHome, hostSurface, readTokens, seamOf, supplyPortOf } from '@dsh-workbench/shared/host';
import {
  filesOf,
  findFileOf,
  kitTypeHintOf,
  namesIn,
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
import {
  DEPS_NAMES,
  depDeclarationFiles,
  isDepName,
  renderDepText,
  renderDepsText,
  surfaceCoreRoot,
} from '@/shared/api/host/diy-deps';
import { publicTypeOf, renderTypeText } from '@/shared/api/host/diy-types';
import { renderTokensText } from '@/shared/api/host/diy-tokens';
import { asRecord, asText, moduleDirsOf, OUTPUT, plainJson, workspaceOf } from './diy-context';
import { DIY_SURFACE_TOOL } from '../unit';

const MAX_SURFACE_NAMES = 8;

export function surfaceTool(ctx: DshHostContext): DshToolDefinition {
  return {
    name: DIY_SURFACE_TOOL,
    description:
      '查询工作台提供的能力：kit、原语、令牌、dsh 进程能力与 deps。',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            '要查询的名称（如 Card，或公开类型名 UnitSeam / CardProps；scope=deps 时是 deps 成员名；以 --dsw- 开头时连同取值返回；可逗号 / 空白分隔多个，一次回多段）。',
        },
        scope: { type: 'string', enum: ['kit', 'primitives', 'tokens', 'platform', 'deps'], description: 'kit=组件 / primitives=原语 / tokens=令牌 / platform=dsh 进程能力 / deps=工作台依赖（可配 name 单点查）；默认 kit 与 primitives。' },
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
      const names = namesIn(asText(args['name']));
      const name = names[0] ?? '';
      const bucket = asText(args['bucket']);
      const all = args['all'] === true;
      if (names.length > 1 && scope !== 'platform') {
        const limited = names.slice(0, MAX_SURFACE_NAMES);
        const parts: Record<string, unknown>[] = [];
        for (const one of limited) parts.push(asRecord(await surfaceTool(ctx).execute({ ...args, name: one }, exec)));
        const text = parts.map((one) => asText(one['text'])).join('\n\n---\n\n');
        return plainJson({
          workspace: root,
          scope,
          name: names.join(','),
          names,
          bucket,
          all,
          file: null,
          from: 'multi',
          primitives: parts[0]?.['primitives'] ?? null,
          kit: parts[0]?.['kit'] ?? null,
          deps: parts[0]?.['deps'] ?? null,
          files: parts[0]?.['files'] ?? null,
          text:
            names.length > MAX_SURFACE_NAMES
              ? `${text}\n\n（只回了前 ${String(MAX_SURFACE_NAMES)} 个；其余分批查）`
              : text,
        });
      }
      if (scope === 'deps') {
        const coreRoot = surfaceCoreRoot();
        const type = name === '' || isDepName(name) ? null : publicTypeOf(name, coreRoot, []);
        const text =
          name === ''
            ? renderDepsText(coreRoot)
            : type !== null
              ? renderTypeText(type)
              : renderDepText(name, coreRoot);
        return plainJson({
          workspace: root,
          scope,
          name,
          bucket,
          all,
          deps: DEPS_NAMES,
          files: depDeclarationFiles(coreRoot),
          text,
        });
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
        const dirs = [profile ?? '', join(dshHome(), 'profiles'), root, ...moduleDirsOf(root)];
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
      const local =
        [root, ...moduleDirsOf(root)]
          .map((dir) => ({ dir, bin: toolchainBinOf(dir) }))
          .find((one) => one.bin !== null) ?? null;
      const bin = local?.bin ?? null;
      if (bin === null) {
        throw new Error(
          `当前工作区及其模块中都没有 dsh-wb-module（${join(root, 'node_modules')} 下不存在）。` +
            '在该目录执行一次 pnpm install 即可；workbench_diy_status 会说明停在哪一步',
        );
      }
      const seam = seamOf(ctx);
      if (seam === undefined) throw new Error('本机没有 shell 服务，无法读取组件清单');

      const workdir = local?.dir ?? root;
      const [primitives, kit] = await Promise.all([
        wantsPrimitives(scope) ? runSurfaceQuery(seam, bin, 'primitives', workdir) : Promise.resolve(undefined),
        wantsKit(scope) ? runSurfaceQuery(seam, bin, 'kit', workdir) : Promise.resolve(undefined),
      ]);
      const query: SurfaceQuery = {
        ...(primitives === undefined ? {} : { primitives }),
        ...(kit === undefined ? {} : { kit }),
      };
      const found = name === '' ? null : findFileOf(name, query);
      if (scope === 'all' && name !== '' && found === null && isDepName(name)) {
        const coreRoot = surfaceCoreRoot();
        return plainJson({
          workspace: root,
          scope,
          name,
          bucket,
          all,
          file: null,
          from: null,
          primitives: primitives ?? null,
          kit: kit ?? null,
          deps: DEPS_NAMES,
          files: depDeclarationFiles(coreRoot),
          text: renderDepText(name, coreRoot),
        });
      }
      if ((scope === 'all' || scope === 'kit') && name !== '' && found === null) {
        const fact = publicTypeOf(name, surfaceCoreRoot(), Object.values(filesOf(kit ?? {})));
        if (fact !== null) {
          return plainJson({
            workspace: root,
            scope,
            name,
            bucket,
            all,
            file: fact.path,
            from: 'type',
            primitives: primitives ?? null,
            kit: kit ?? null,
            text: renderTypeText(fact),
          });
        }
      }
      const kitFiles = Object.values(filesOf(kit ?? {}));
      const hint =
        found !== null && found.from === 'kit'
          ? kitTypeHintOf(found.file, name, surfaceCoreRoot(), kitFiles)
          : '';
      const text =
        name === ''
          ? renderSurfaceText(query, { scope, all, bucket })
          : renderNameText(name, found, query, hint);
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
