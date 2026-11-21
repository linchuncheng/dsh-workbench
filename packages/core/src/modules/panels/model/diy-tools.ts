import { toolRegistryOf } from './tool-registry-guard';
import type { DshHostContext, DshToolDefinition, DshToolRunContext } from '@dsh-workbench/shared/host';
import type { DebugStore, PanelStateStore } from '@dsh-workbench/shared/host';
import { PANEL_STATE_SERVICE, UNITS_SERVICE, WORKBENCH_ADAPTERS, supplyPortOf } from '@dsh-workbench/shared/host';
import type { AdapterSet, LongTaskBase, LongTaskRegistry } from '@dsh-workbench/shared/host';

import { registerSurfaceTool } from './diy-surface';
import { registerDebugTools } from './diy-debug-tools';
import { registerLogTools } from './diy-logs';
import { registerBrowserTools } from './diy-browser-tools';

async function unitsAt(
  ctx: DshHostContext,
  exec: DshToolRunContext,
): Promise<{ readonly root: string; readonly units: ReturnType<typeof unitsOf>['units'] }> {
  const { root } = await workspaceOf(ctx, exec);
  return { root, units: unitsOf(ctx, root).units };
}

const UNIT_PARAMETERS = {
  type: 'object',
  properties: { unit: { type: 'string', description: '模块标识（workbench_diy_status 会给出）。' } },
  required: ['unit'],
  additionalProperties: false,
} as const;

export function browserBridgeOn(ctx: DshHostContext): boolean {
  const adapters = ctx.get(WORKBENCH_ADAPTERS, false) as AdapterSet | undefined;
  if (adapters === undefined) return true;
  return adapters.runtime.capabilities(ctx).browserBridge;
}

import { registerSpecTool } from './diy-spec';
import { registerPublishTool } from './diy-publish';
import type { UnitRegistry } from '@/kernel/host/unit-registry';
import { keywordsOf, reconOf } from '@/shared/api/host/diy-recon';
import { surfaceOf } from '@/shared/api/host/runtime-surface';
import { installedPluginsOf, reconCatalogOf } from '@/shared/api/host/diy-recon-fs';
import { healthOf, publishStatusOf, renderPanel, renderStatus, statusOf, type ModuleStatus } from './diy-report';
import type { PublishPreview } from '@dsh-workbench/shared/contract/protocol/market-index';
import { insideRoot } from '@/shared/api/host/diy-modules';
import {
  asRecord,
  asText,
  modulesOf,
  OUTPUT,
  panelEntriesOf,
  plainJson,
  showOrReason,
  unitsOf,
  verdictOf,
  workspaceOf,
  type KnownUnit,
} from './diy-context';
import type { MarketService } from './market';
import type { PanelsService } from './service';
import {
  DIY_INSTALL_TOOL,
  DIY_PANEL_TOOL,
  DIY_RECON_TOOL,
  DIY_SHOW_TOOL,
  DIY_STATUS_TOOL,
} from '../unit';

export function registerDiyTools(
  ctx: DshHostContext,
  market: MarketService,
  panels: PanelsService,
  debug: DebugStore,
  previewOf: (root: string, unit: string) => PublishPreview | null = () => null,
  inferredAuthorOf: (root: string, unit: string) => Promise<string | undefined> = async () => undefined,
  installRuns?: LongTaskRegistry<LongTaskBase>,
): Array<() => void> {
  const supply = supplyPortOf(ctx);
  const tools = toolRegistryOf(ctx, '跳过 DIY 工具注册');
  if (tools === undefined) return [];

  const statusTool: DshToolDefinition = {
    name: DIY_STATUS_TOOL,
    description:
      '查看模块状态：安装、源码、面板识别、启动能力与下一步；不填 unit 则列出全部模块。',
    parameters: {
      type: 'object',
      properties: { unit: { type: 'string', description: '模块标识；不填则列出全部模块。' } },
      required: [],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root, units } = await unitsAt(ctx, exec);
      const registry = ctx.get(UNITS_SERVICE) as UnitRegistry | undefined;
      const panelEntries = panelEntriesOf(panels, root);
      const wanted = asText(asRecord(raw)['unit']);
      const picked = wanted === '' ? units : units.filter((one) => one.unit === wanted);
      if (wanted !== '' && picked.length === 0) {
        throw new Error(
          `当前会话没有模块标识为「${wanted}」的模块` +
            `（已安装：${units.map((one) => one.unit).join(', ') || '（空）'}）`,
        );
      }
      const rows = picked.map(
        (one): ModuleStatus =>
          statusOf({
            dir: one.dir,
            unit: one.unit,
            name: one.name,
            installed: one.installed,
            known: panelEntries.some((entry) => entry.id === one.unit),
            open: panels.isEnabled(one.unit, root),
            health: healthOf({ registry, unit: one.unit, installed: one.installed }),
            mountedAt: registry?.addedAt?.(one.unit),
          }),
      );
      const preview = wanted === '' ? null : previewOf(root, wanted);
      const text = [renderStatus(root, rows), publishStatusOf(preview)].filter((one) => one !== '').join('\n');
      return plainJson({
        workspace: root,
        status: rows,
        ...(preview === null ? {} : { publish: preview }),
        text,
      });
    },
  };

  const panelTool: DshToolDefinition = {
    name: DIY_PANEL_TOOL,
    description: '面板当前状态：每个模块界面是否读取成功、是否崩溃过。用户说「卡片不对」或「一片空白」时先调用。',
    parameters: {
      type: 'object',
      properties: { unit: { type: 'string', description: '模块标识；不填则查看全部模块。' } },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const { installed, units } = unitsOf(ctx, root);
      const panelState = ctx.get(PANEL_STATE_SERVICE) as PanelStateStore | undefined;
      const registry = ctx.get(UNITS_SERVICE) as UnitRegistry | undefined;
      const panelEntries = panelEntriesOf(panels, root);
      const snapshot = panelState?.snapshot(root) ?? { workspace: root, at: 0, units: [] };
      const wanted = asText(asRecord(raw)['unit']);
      const board = panelEntries.filter((entry) => entry.shown && entry.hasCard).map((entry) => entry.id);
      const nameOf = new Map(units.map((one) => [one.unit, one.name]));
      const reported = new Map(snapshot.units.map((one) => [one.unit, one]));
      const order = [...new Set([...board, ...reported.keys(), ...nameOf.keys()])];
      const rows = order
        .filter((unit) => wanted === '' || unit === wanted)
        .map((unit) => {
          const report = reported.get(unit);
          const mountedAt = registry?.addedAt?.(unit);
          return {
            unit,
            name: nameOf.get(unit) ?? '',
            health: healthOf({ registry, unit, installed: installed.includes(unit) }),
            ...(mountedAt === undefined ? {} : { mountedAt }),
            ...(report === undefined ? {} : { report }),
          };
        });
      const text = renderPanel({
        root,
        rows,
        board,
        at: snapshot.at,
        now: Date.now(),
      });
      return plainJson({ workspace: root, board, report: snapshot, panels: rows, text });
    },
  };

  const surface = surfaceOf(ctx);
  const reconTool: DshToolDefinition = {
    name: DIY_RECON_TOOL,
    description:
      surface === undefined
        ? '这个运行时的命令面无法探测：直接调用 workbench_diy_eval / _find 读取一次。'
        : `先查 ${surface.name} 是否已有现成能力（自带适配器或本机插件）；其用途自行查阅，不要询问用户。`,
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '站点名 / 系统名 / 域名；英文名或域名最准确（例：bilibili、inventory）。',
        },
        url: { type: 'string', description: '该系统地址（从中取域名）。' },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, _exec: DshToolRunContext) {
      const args = asRecord(raw);
      const surface = surfaceOf(ctx);
      if (surface === undefined) {
        throw new Error(
          '这个运行时没有可探测的命令面，recon 不可用。改用 workbench_diy_eval / _find 直接读取：' +
            '带 read=<地址>，在 workbench-read 上运行，使用用户已登录的页面。',
        );
      }
      const keywords = keywordsOf(asText(args['keyword']), asText(args['url']));
      if (keywords.length === 0) {
        throw new Error(
          `recon 需要关键词（站点名 / 系统名 / 域名均可）。先在 ${surface.name} 自带的目录中查找现成能力，` +
            '不要自行编写适配器；用户不知道有这条命令面，这一步不要询问用户。',
        );
      }
      const catalogPath = supply.cliCatalogPath?.();
      if (catalogPath === undefined) {
        throw new Error(
          `这个运行时没有命令目录：${surface.name} 只提供命令面，不提供目录。` +
            '改用 workbench_diy_find 按站点查询它能做什么。',
        );
      }
      const catalog = reconCatalogOf(catalogPath);
      if (catalog === undefined) {
        const hint = supply.runtimeInstallCommand?.() ?? '请先完成隔离运行时的安装';
        throw new Error(`读不到 ${surface.name} 的目录（${catalogPath}）；隔离运行时尚未安装完成。下一步：${hint}`);
      }
      const pluginsDir = supply.vendorPluginsDir?.();
      const installed = pluginsDir === undefined ? [] : installedPluginsOf(pluginsDir, surface.pluginPrefix);
      const answer = reconOf(catalog, installed, keywords, surface);
      return plainJson({ ok: true, ...answer });
    },
  };

  function unitAmong(units: readonly KnownUnit[], raw: unknown, label: string): KnownUnit {
    const unit = asText(asRecord(raw)['unit']);
    const pool = units.map((one) => one.unit);
    if (unit === '') {
      throw new Error(`${label} 缺少 unit（已安装：${pool.join(', ') || '（空）'}）`);
    }
    const found = units.find((one) => one.unit === unit);
    if (found === undefined) {
      throw new Error(`当前会话没有模块标识为「${unit}」的模块（已安装：${pool.join(', ') || '（空）'}）`);
    }
    return found;
  }

  function unitOf(root: string, raw: unknown, label: string) {
    const { modules } = modulesOf(ctx, root);
    const unit = asText(asRecord(raw)['unit']);
    if (unit === '') {
      throw new Error(`${label} 缺少 unit（当前工作区：${modules.map((one) => one.unit).join(', ') || '（空）'}）`);
    }
    const found = modules.find((one) => one.unit === unit);
    if (found === undefined) {
      throw new Error(
        `当前工作区没有模块标识为「${unit}」的模块` +
          `（可用：${modules.map((one) => one.unit).join(', ') || '（空）'}）；安装的前提是该模块已在当前工作区创建。`,
      );
    }
    if (!insideRoot(root, found.dir)) {
      throw new Error(`这个模块不在当前工作区（${found.dir}）；只能安装 ${root} 之下的模块。`);
    }
    return found;
  }

  const showTool: DshToolDefinition = {
    name: DIY_SHOW_TOOL,
    description: '仅显示到看板（不安装）：把已安装的模块显示在当前工作区的面板上。',
    parameters: UNIT_PARAMETERS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root, units } = await unitsAt(ctx, exec);
      const found = unitAmong(units, raw, 'workbench_diy_show');
      if (!found.installed) {
        throw new Error(
          `${found.unit} 尚未安装；仅显示到看板的前提是已安装。首次安装用 workbench_diy_install。`,
        );
      }
      const panel = showOrReason(panels, found.unit, root);
      const text = panel.ok
        ? `已在面板上打开（${root}）。验收使用这张模块界面，由 agent 亲自操作一遍。`
        : `面板尚未打开：${panel.reason}。workbench_diy_status 会给出同样的判断。`;
      return plainJson({ workspace: root, unit: found.unit, path: found.dir, panel, text });
    },
  };

  const installTool: DshToolDefinition = {
    name: DIY_INSTALL_TOOL,
    description:
      '把当前工作区中创建的模块安装并显示到面板。这是持久变更，每个模块只安装一次；' +
      '之后改源码只需 dsh-wb-module build（宿主侧秒级热替换）。',
    parameters: UNIT_PARAMETERS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const found = unitOf(root, raw, 'workbench_diy_install');

      if (found.installed) {
        const panel = showOrReason(panels, found.unit, root);
        const text = [
          '这个模块已经安装过（当前工作区中的这一份）。不要再安装：修改源码后执行 dsh-wb-module build，宿主侧与 client.js 都会热替换（dsh-client-hmr 监听每个 bundle 的 lib/client.js，重建后替换进已打开的页面）。',
          panel.ok
            ? `已在面板上打开（${root}）。验收使用这张模块界面，由 agent 亲自操作一遍。`
            : `面板尚未打开：${panel.reason}。调用 workbench_diy_show（unit=${found.unit}）。`,
        ].join('\n');
        return plainJson({
          workspace: root,
          unit: found.unit,
          path: found.dir,
          alreadyInstalled: true,
          panel,
          text,
        });
      }

      const job: { settle?: (error?: unknown) => void } = {};
      installRuns?.start({ workspace: root, target: found.unit, payload: job });
      let outcome: Awaited<ReturnType<MarketService['installBundle']>>;
      try {
        outcome = await market.installBundle(found.dir);
      } catch (error) {
        job.settle?.(error);
        throw error;
      }
      job.settle?.();
      const verdict = verdictOf(outcome.change);
      const restartRequired = outcome.change.application === 'restart-required';
      const panel =
        outcome.change.application === 'applied'
          ? showOrReason(panels, found.unit, root)
          : { ok: false, reason: `安装结果是 ${outcome.change.application}，尚未生效` };

      const panelText = panel.ok
        ? `已在面板上打开（${root}）。验收使用这张模块界面，由 agent 亲自操作一遍。`
        : outcome.change.application === 'applied'
          ? `面板尚未打开：${panel.reason}。调用 workbench_diy_show（unit=${found.unit}）重试。`
          : restartRequired
            ? `面板尚未打开（${panel.reason}）：模块需要**重启一次工作台**才会注册进面板。把这句话转告用户，` +
              `重启后再调用 workbench_diy_show（unit=${found.unit}）。`
            : `面板尚未打开：${panel.reason}。先处理上面的安装失败，再显示到看板。`;

      const text = [
        `${verdict}：${found.unit}（${found.name}）`,
        panelText,
        '此后只需修改源码并执行 dsh-wb-module build，宿主侧与 client.js 都会热替换（dsh-client-hmr 监听每个 bundle 的 lib/client.js，重建后替换进已打开的页面）：不要再安装一遍。',
      ].join('\n');

      return plainJson({
        workspace: root,
        unit: found.unit,
        path: found.dir,
        install: outcome.change,
        module: outcome.module,
        panel,
        text,
      });
    },
  };


  return [
    tools.register(statusTool),
    tools.register(panelTool),
    ...registerSurfaceTool(ctx, tools),
    tools.register(reconTool),
    ...registerSpecTool(ctx, tools),
    ...registerLogTools(ctx, tools),
    ...(browserBridgeOn(ctx) ? registerBrowserTools(ctx, tools) : []),
    ...registerDebugTools(ctx, tools, debug),
    tools.register(showTool),
    tools.register(installTool),
    registerPublishTool(ctx, tools, {
      resolve: (root, raw) => unitOf(root, raw, 'workbench_diy_publish'),
      previewOf,
      inferredAuthorOf,
    }),
  ];
}
