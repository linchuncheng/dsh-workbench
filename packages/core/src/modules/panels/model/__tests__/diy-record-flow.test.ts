import { describe, expect, it } from 'vitest';
import { createDiyRig } from '../../__tests__/diy-harness';
import { heldStore, URL } from '../../__tests__/record-fixtures';
import type { RecordFlowPort } from '../diy-record-tools';
import { DIY_RECORD_PREPARE_TOOL, DIY_RECORD_STOP_TOOL } from '../../unit';

function portOf(
  step: { readonly id: string; readonly title?: string } | null,
  gaps: readonly string[] = [],
): {
  readonly port: RecordFlowPort;
  readonly started: string[];
} {
  const started: string[] = [];
  const port: RecordFlowPort = {
    flowOf: () => ({ id: 'diy-write-record' }),
    stepOf: () => step,
    start: (session) => {
      started.push(session);
    },
    advance: async () => undefined,
    finish: async () => undefined,
    gaps: () => gaps,
  };
  return { port, started };
}

describe('录一次写：窗口与段归流程管，不归 agent 记', () => {
  const rig = createDiyRig();

  it('★★ 停在「探测」：不许再 prepare —— 补什么先递进流程', async () => {
    rig.scaffold('demo');
    const { port } = portOf({ id: 'scan', title: '探测' });
    const built = rig.harness({ withTools: true, pact: false, record: heldStore(null), recordFlow: port });

    await expect(
      built.tool(DIY_RECORD_PREPARE_TOOL).execute({ unit: 'demo', url: URL, doing: '发布' }, rig.diyExec()),
    ).rejects.toThrow(/现在停在「探测」/);
    expect(built.commands).toHaveLength(0);
  });

  it('★★ 停在「录制」：不许 stop —— 还没到收工那一步，补录用 prepare', async () => {
    rig.scaffold('demo');
    const { port } = portOf({ id: 'record', title: '录制' });
    const built = rig.harness({ withTools: true, pact: false, record: heldStore(null), recordFlow: port });

    const out = (await built.tool(DIY_RECORD_STOP_TOOL).execute({}, rig.diyExec())) as {
      ok: boolean;
      code: string;
      text: string;
    };

    expect(out.ok).toBe(false);
    expect(out.code).toBe('flow-step');
    expect(out.text).toContain('补录');
    expect(built.commands).toHaveLength(0);
    expect(built.record.live(Date.now())).not.toBeNull();
  });

  it('★ 还没有流程：prepare 先把这条流程起起来', async () => {
    rig.scaffold('demo');
    const started: string[] = [];
    const port: RecordFlowPort = {
      flowOf: () => null,
      stepOf: () => null,
      start: (session) => {
        started.push(session);
      },
      advance: async () => undefined,
      finish: async () => undefined,
      gaps: () => [],
    };
    const built = rig.harness({ withTools: true, pact: false, record: heldStore(null), recordFlow: port });

    await built
      .tool(DIY_RECORD_PREPARE_TOOL)
      .execute({ unit: 'demo', url: URL, doing: '发布' }, rig.diyExec())
      .catch(() => undefined);

    expect(started).toHaveLength(1);
  });
});

describe('补录必须落在同一扇窗上', () => {
  const rig = createDiyRig();

  it('★★ 上一段已结束、记着的标签丢了 ⇒ 按地址认回那扇窗，不撞「已经持有一场」', async () => {
    rig.scaffold('demo');
    const store = heldStore(null);
    const now = Date.now();
    store.started('s1', now, now);
    store.finished('s1', now, now);
    const port: RecordFlowPort = {
      flowOf: () => ({ id: 'diy-write-record' }),
      stepOf: () => ({ id: 'supplement', title: '补录' }),
      start: () => undefined,
      advance: async () => undefined,
      finish: async () => undefined,
      gaps: () => [],
    };
    const built = rig.harness({
      withTools: true,
      pact: false,
      record: store,
      recordFlow: port,
      probe: [{ stdout: JSON.stringify({ ok: true, data: [{ page: 'TAB-1', url: URL }] }) }],
    });

    const out = await built
      .tool(DIY_RECORD_PREPARE_TOOL)
      .execute({ unit: 'demo', url: URL, doing: '发布' }, rig.diyExec())
      .catch((error: unknown) => error);

    expect(String(out)).not.toContain('已经持有一场录制');
    expect(built.commands[0]).toContain("'tab' 'list'");
  });
});

describe('缺口没补上就不许收工：引擎挡，不靠 agent 自觉', () => {
  const rig = createDiyRig();

  it('★★ 停在「完成」但缺口还在：stop 被挡，回包点名缺口', async () => {
    rig.scaffold('demo');
    const { port } = portOf({ id: 'finish', title: '完成' }, ['负责人选「乙」时的取值']);
    const built = rig.harness({ withTools: true, pact: false, record: heldStore(null), recordFlow: port });

    const out = (await built.tool(DIY_RECORD_STOP_TOOL).execute({}, rig.diyExec())) as {
      ok: boolean;
      code: string;
      text: string;
    };

    expect(out.ok).toBe(false);
    expect(out.code).toBe('gaps-open');
    expect(out.text).toContain('负责人选「乙」时的取值');
    expect(built.commands).toHaveLength(0);
  });
});
