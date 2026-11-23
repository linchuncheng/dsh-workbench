import type { UnitManifest } from '@dsh-workbench/shared';
import type { McpServerPacks, ToolScopeContext } from '@dsh-workbench/shared/host';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { DIY_PACK_TOOLS, MANAGE_TOOLS, RESIDENT_TOOLS } from '../unit';

export { PACK_TARGET_LIMIT } from '../unit';

export type ShellPackId = 'manage' | 'diy';

export type PackId = ShellPackId | `unit:${string}` | `mcp:${string}`;

export interface PackLabel {
  readonly zh: string;
  readonly en: string;
}

export type PackKind = 'shell' | 'unit' | 'mcp';

export interface PackEntry {
  readonly id: PackId;
  readonly label: PackLabel;
  readonly hint: string;
  readonly tools: readonly string[];
  readonly kind: PackKind;
}

const HINT_MAX = 80;

function clipped(text: string): string {
  if (text.length <= HINT_MAX) return text;
  const cut = text.slice(0, HINT_MAX);
  const at = Math.max(cut.lastIndexOf(' · '), cut.lastIndexOf('，'), cut.lastIndexOf('；'), cut.lastIndexOf('。'));
  return at > 0 ? cut.slice(0, at) : cut;
}

function unitHint(description: string | undefined, tools: readonly { readonly name: string }[]): string {
  const summary = (description ?? '').trim();
  if (summary !== '') return clipped(summary);
  return clipped(tools.map((tool) => tool.name.replace(/^workbench_/, '')).join(' · '));
}

const SHELL_PACKS: readonly PackEntry[] = [
  {
    id: 'manage',
    label: { zh: '工作台管理', en: 'workbench admin' },
    hint: '面板 · 安装 / 卸载 / 更新模块 · 市场 · 长任务',
    tools: MANAGE_TOOLS,
    kind: 'shell',
  },
  {
    id: 'diy',
    label: { zh: 'DIY 工具', en: 'DIY tools' },
    hint: '工坊 · 创建 / 安装 / 发布模块 · 调试 · 录制 · 日志 · 页面动作',
    tools: DIY_PACK_TOOLS,
    kind: 'shell',
  },
];

export interface Toolbox {
  catalog(workspace?: string | null): readonly PackEntry[];
  packsOf(session: string | null, preset: string | null): ReadonlySet<PackId>;
  closedPackOf(tool: string, context: ToolScopeContext): PackEntry | undefined;
  open(session: string, packs: readonly PackId[], preset: string | null): readonly PackId[];
  close(session: string, packs: readonly PackId[], preset: string | null): readonly PackId[];
  subscribe(listener: () => void): () => void;
  resolve(targets: readonly string[], workspace?: string | null): {
    readonly packs: readonly PackId[];
    readonly unknown: readonly string[];
    readonly hidden: readonly string[];
  };
  deniedTools(context: ToolScopeContext): readonly string[];
}

interface SessionState {
  readonly opened: Set<PackId>;
  readonly closed: Set<PackId>;
}

function defaultPacks(preset: string | null): ReadonlySet<PackId> {
  return new Set<PackId>(preset === DIY_PRESET_ID ? ['diy'] : []);
}

function unitPacks(manifests: readonly UnitManifest[]): readonly PackEntry[] {
  return manifests.flatMap((manifest) => {
    if (manifest.id === 'panels') return [];
    const tools = manifest.tools ?? [];
    if (tools.length === 0) return [];
    const label = manifest.title ?? { zh: manifest.id, en: manifest.id };
    return [
      {
        id: `unit:${manifest.id}` as PackId,
        label: { zh: label.zh, en: label.en },
        hint: unitHint(manifest.description, tools),
        tools: tools.map((tool) => tool.name),
        kind: 'unit',
      },
    ];
  });
}

export function createToolbox(options: {
  readonly manifests: () => readonly UnitManifest[];
  readonly visibleUnits?: ((workspace: string | null) => ReadonlySet<string>) | undefined;
  readonly mcp?: (() => readonly McpServerPacks[]) | undefined;
  readonly flowDenied?: ((context: ToolScopeContext) => readonly string[]) | undefined;
}): Toolbox {
  const states = new Map<string, SessionState>();
  const listeners = new Set<() => void>();

  const stateOf = (session: string): SessionState => {
    const found = states.get(session);
    if (found !== undefined) return found;
    const created: SessionState = { opened: new Set(), closed: new Set() };
    states.set(session, created);
    return created;
  };

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const mcpPacks = (): readonly PackEntry[] =>
    (options.mcp?.() ?? []).map((server) => ({
      id: `mcp:${server.name}`,
      label: { zh: `${server.name}（MCP）`, en: `${server.name} (MCP)` },
      hint: '',
      tools: server.tools,
      kind: 'mcp',
    }));

  const catalog = (workspace?: string | null): readonly PackEntry[] => {
    const units = unitPacks(options.manifests());
    const mcp = mcpPacks();
    if (workspace === undefined || options.visibleUnits === undefined) return [...SHELL_PACKS, ...units, ...mcp];
    const visible = options.visibleUnits(workspace);
    return [
      ...SHELL_PACKS,
      ...units.filter((pack) => visible.has(pack.id.slice('unit:'.length))),
      ...mcp,
    ];
  };

  const packsOf = (session: string | null, preset: string | null): ReadonlySet<PackId> => {
    const open = new Set<PackId>(defaultPacks(preset));
    if (preset === DIY_PRESET_ID) open.delete('manage');
    if (session === null) return new Set(catalog().map((pack) => pack.id));
    const state = states.get(session);
    if (state === undefined) return open;
    for (const pack of state.opened) open.add(pack);
    for (const pack of state.closed) open.delete(pack);
    return open;
  };

  const deniedNames = (context: ToolScopeContext): ReadonlySet<string> => {
    const open = packsOf(context.session, context.preset);
    const deny = new Set<string>();
    for (const pack of catalog()) {
      if (open.has(pack.id)) continue;
      for (const name of pack.tools) deny.add(name);
    }
    const allowed = new Set<string>();
    for (const pack of catalog()) {
      if (!open.has(pack.id)) continue;
      for (const name of pack.tools) allowed.add(name);
    }
    for (const name of allowed) deny.delete(name);
    for (const name of RESIDENT_TOOLS) deny.delete(name);
    for (const name of options.flowDenied?.(context) ?? []) {
      if (!(RESIDENT_TOOLS as readonly string[]).includes(name)) deny.add(name);
    }
    return deny;
  };

  return {
    catalog,
    packsOf,

    closedPackOf(tool, context) {
      if (!deniedNames(context).has(tool)) return undefined;
      const open = packsOf(context.session, context.preset);
      return catalog().find((pack) => !open.has(pack.id) && pack.tools.includes(tool));
    },

    open(session, packs, preset) {
      const entries = new Set(catalog().map((pack) => pack.id));
      const state = stateOf(session);
      const newly: PackId[] = [];
      for (const pack of packs) {
        if (!entries.has(pack)) continue;
        const wasOpen = packsOf(session, preset).has(pack);
        state.closed.delete(pack);
        state.opened.add(pack);
        if (!wasOpen) newly.push(pack);
      }
      if (newly.length > 0) notify();
      return newly;
    },

    close(session, packs, preset) {
      const state = stateOf(session);
      const closed: PackId[] = [];
      for (const pack of packs) {
        const wasOpen = packsOf(session, preset).has(pack);
        state.opened.delete(pack);
        state.closed.add(pack);
        if (wasOpen) closed.push(pack);
      }
      if (closed.length > 0) notify();
      return closed;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    resolve(targets, workspace) {
      const entries = new Map(catalog(workspace).map((pack) => [pack.id, pack.id] as const));
      const all = new Map(catalog().map((pack) => [pack.id, pack.id] as const));
      const packs: PackId[] = [];
      const unknown: string[] = [];
      const hidden: string[] = [];
      for (const target of targets) {
        const id = target.trim();
        if (id === '') continue;
        const found = entries.get(id as PackId);
        if (found === undefined) {
          if (all.has(id as PackId)) hidden.push(id);
          else unknown.push(id);
        } else if (!packs.includes(found)) packs.push(found);
      }
      return { packs, unknown, hidden };
    },

    deniedTools(context) {
      return [...deniedNames(context)];
    },
  };
}
