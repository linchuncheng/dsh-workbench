import { describe, expect, it } from 'vitest';
import type { DebugState } from '@dsh-workbench/shared/host';
import { approvalPrecheckOf } from '../approval-prechecks';
import {
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_TOOL,
  PANELS_FOLLOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_SHOW_TOOL,
} from '../../unit';

const held = (sessionId: string, phase: DebugState['phase']): DebugState => ({
  sessionId,
  phase,
  workspacePath: '/w',
  title: '工作台',
  board: '/w',
  unit: 'demo',
  name: 'demo',
  startedAt: 0,
  at: 0,
});

describe('审批前预检：开工前就判得出来的，不让人白点一次', () => {
  it('★ 面板上不存在的模块：直接拒，理由带着可用清单', () => {
    const switchDenyOf = (id: string): string | undefined =>
      id === 'ghost' ? '没有这个模块：ghost（可用：issues）' : undefined;

    for (const name of [PANELS_SHOW_TOOL, PANELS_HIDE_TOOL, PANELS_MOVE_TOOL]) {
      expect(approvalPrecheckOf({ name, arguments: { id: 'ghost' } }, { switchDenyOf })).toContain(
        '没有这个模块：ghost',
      );
      expect(approvalPrecheckOf({ name, arguments: { id: 'issues' } }, { switchDenyOf })).toBeUndefined();
    }
  });

  it('★ 机器级默认板没有顺序 / 没有"恢复跟随"：这两条不再弹审批', () => {
    expect(approvalPrecheckOf({ name: PANELS_MOVE_TOOL, arguments: { id: 'issues', scope: 'machine' } }, {})).toContain(
      '机器级默认板没有顺序',
    );
    expect(
      approvalPrecheckOf({ name: PANELS_FOLLOW_TOOL, arguments: { id: 'issues', scope: 'machine' } }, {}),
    ).toContain('恢复跟随');
  });

  it('★ 没有这个模块就不弹安装 / 更新 / 卸载的审批', () => {
    const moduleDenyOf = (unit: string): string | undefined =>
      unit === 'ghost' ? '没有这个模块：ghost' : undefined;

    for (const name of [MODULES_INSTALL_TOOL, MODULES_UPDATE_TOOL, MODULES_UNINSTALL_TOOL]) {
      expect(approvalPrecheckOf({ name, arguments: { id: 'ghost' } }, { moduleDenyOf })).toContain('ghost');
      expect(approvalPrecheckOf({ name, arguments: { id: 'issues' } }, { moduleDenyOf })).toBeUndefined();
    }
  });

  it('★ install-bundle 没给 spec：不发起一张装不了东西的审批', () => {
    expect(approvalPrecheckOf({ name: MODULES_INSTALL_BUNDLE_TOOL, arguments: {} }, {})).toContain('缺少 spec');
    expect(
      approvalPrecheckOf({ name: MODULES_INSTALL_BUNDLE_TOOL, arguments: { spec: '@demo/probe' } }, {}),
    ).toBeUndefined();
  });

  it('★ 调试：已被占用 / 归别的会话 / 没有调试 / 已在调试 —— 都不再弹审批', () => {
    const debugOf = (state: DebugState | null) => () => state;

    expect(approvalPrecheckOf({ name: DIY_DEBUG_START_TOOL, arguments: {}, session: 's1' }, { debugOf: debugOf(held('s2', 'paused')) })).toContain('另一场');
    expect(approvalPrecheckOf({ name: DIY_DEBUG_START_TOOL, arguments: {}, session: 's1' }, { debugOf: debugOf(held('s1', 'debugging')) })).toContain('已持有');
    expect(approvalPrecheckOf({ name: DIY_DEBUG_START_TOOL, arguments: {}, session: 's1' }, { debugOf: debugOf(null) })).toBeUndefined();
    expect(
      approvalPrecheckOf(
        { name: MODULES_INSTALL_BUNDLE_TOOL, arguments: { spec: '@demo/probe' } },
        { debugOf: debugOf(null) },
      ),
    ).toBeUndefined();

    expect(approvalPrecheckOf({ name: DIY_DEBUG_RESUME_TOOL, arguments: {}, session: 's1' }, { debugOf: debugOf(null) })).toContain('没有调试');
    expect(approvalPrecheckOf({ name: DIY_DEBUG_RESUME_TOOL, arguments: {}, session: 's1' }, { debugOf: debugOf(held('s2', 'paused')) })).toContain('不属于当前会话');
    expect(approvalPrecheckOf({ name: DIY_DEBUG_RESUME_TOOL, arguments: {}, session: 's1' }, { debugOf: debugOf(held('s1', 'debugging')) })).toContain('正在调试');
    expect(approvalPrecheckOf({ name: DIY_DEBUG_RESUME_TOOL, arguments: {}, session: 's1' }, { debugOf: debugOf(held('s1', 'paused')) })).toBeUndefined();
  });

  it('★ 开始调试没给 unit、又不是只有一个已装模块：先说清需要哪一个', () => {
    const debugUnitsOf = (): readonly string[] => ['alpha', 'beta'];

    expect(approvalPrecheckOf({ name: DIY_DEBUG_START_TOOL, arguments: {} }, { debugUnitsOf })).toContain(
      '已安装的：alpha, beta',
    );
    expect(
      approvalPrecheckOf({ name: DIY_DEBUG_START_TOOL, arguments: { unit: 'alpha' } }, { debugUnitsOf }),
    ).toBeUndefined();
    expect(approvalPrecheckOf({ name: DIY_DEBUG_START_TOOL, arguments: {} }, { debugUnitsOf: () => ['alpha'] })).toBeUndefined();
  });

  it('别的工具不归这里管', () => {
    expect(approvalPrecheckOf({ name: 'workbench_modules_list', arguments: {} }, {})).toBeUndefined();
  });
});

describe('插件更新 / 卸载：记里没有就不弹审批', () => {
  const pluginDenyOf = (name: string, updating: boolean): string | undefined => {
    if (name === 'ghost') return '插件记录中没有「ghost」';
    if (updating && name === 'local-one') return '「local-one」从本地安装，没有可查询的新版本。';
    return undefined;
  };

  it('★ 记录里没有 / 本地装的没有新版本：审批之前就拒', () => {
    expect(
      approvalPrecheckOf({ name: MODULES_UPDATE_PLUGIN_TOOL, arguments: { plugin: 'ghost' } }, { pluginDenyOf }),
    ).toContain('插件记录中没有');
    expect(
      approvalPrecheckOf({ name: MODULES_UNINSTALL_PLUGIN_TOOL, arguments: { plugin: 'ghost' } }, { pluginDenyOf }),
    ).toContain('插件记录中没有');
    expect(
      approvalPrecheckOf({ name: MODULES_UPDATE_PLUGIN_TOOL, arguments: { plugin: 'local-one' } }, { pluginDenyOf }),
    ).toContain('从本地安装');
  });

  it('卸载本地装的照旧可以；名字认得的插件照常问', () => {
    expect(
      approvalPrecheckOf({ name: MODULES_UNINSTALL_PLUGIN_TOOL, arguments: { plugin: 'local-one' } }, { pluginDenyOf }),
    ).toBeUndefined();
    expect(
      approvalPrecheckOf({ name: MODULES_UPDATE_PLUGIN_TOOL, arguments: { plugin: 'known' } }, { pluginDenyOf }),
    ).toBeUndefined();
  });
});

describe('录制：地址没给 / 不是这个模块的站点，不弹审批', () => {
  const call = (args: Record<string, unknown>) => ({ name: DIY_RECORD_PREPARE_TOOL, arguments: args });

  it('★ 没给 url：先要地址，不发起录制审批', () => {
    expect(approvalPrecheckOf(call({}), {})).toContain('需要该页面的 url');
  });

  it('★ 站点不对：把预检的理由原样带出来', () => {
    const recordUrlDenyOf = (): string => '这个地址不属于该模块探明的站点，先确认再录';

    expect(approvalPrecheckOf(call({ url: 'https://other.example/x' }), { recordUrlDenyOf })).toContain(
      '不属于该模块探明的站点',
    );
    expect(approvalPrecheckOf(call({ url: 'https://other.example/x' }), {})).toBeUndefined();
  });
});
