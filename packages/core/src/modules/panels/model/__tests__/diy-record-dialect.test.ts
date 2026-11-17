import { beforeEach, describe, expect, it } from 'vitest';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { createDiyRig } from '../../__tests__/diy-harness';
import { armProbe, heldStore, POST, URL } from '../../__tests__/record-fixtures';
import { opencliSurface } from '../../__tests__/test-adapters';
import { DIY_RECORD_PREPARE_TOOL, DIY_RECORD_READ_TOOL, DIY_RECORD_STOP_TOOL } from '../../unit';

const sessionLine = (command: string, argv: readonly string[]): string => {
  const [head, session, ...rest] = argv;
  const words =
    head === 'browser' && session !== undefined && session !== '' && !session.startsWith('-')
      ? ['browser', '--session', session, ...rest]
      : [head ?? '', ...(session === undefined ? [] : [session]), ...rest];
  return [command, ...words.filter((one) => one !== '')].map(quoteShellArg).join(' ');
};

const browserLines = (commands: readonly string[]): readonly string[] =>
  commands.filter((one) => one.includes("'browser'"));

describe('会话方言归命令面：2.x 的 --session 由适配器给，整条录制链都照它拼', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
  });

  it('★★ prepare / read / stop 发出去的每条 browser 命令都带 --session（没有一条退回位置参数）', async () => {
    rig.setSurface({ ...opencliSurface, background: sessionLine });
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [
        { stdout: '' },
        { stdout: '[]' },
        { stdout: JSON.stringify({ page: 'p1', url: URL }) },
        { stdout: '{}' },
        { stdout: JSON.stringify({ href: URL }) },
        ...armProbe({ phase: 'finished' }, true),
        { stdout: '' },
        { stdout: JSON.stringify([{ page: 'p1', url: URL, title: '环境' }]) },
        { stdout: '{"closed":"p1"}' },
      ],
    });

    await built.tool(DIY_RECORD_PREPARE_TOOL).execute({ unit: 'demo', url: URL, doing: '发布' }, rig.diyExec());
    await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec());
    await built.tool(DIY_RECORD_STOP_TOOL).execute({}, rig.diyExec());

    const lines = browserLines(built.commands);
    expect(lines.length).toBeGreaterThan(3);
    for (const one of lines) expect(one).toContain("'--session' 'workbench-rec'");
    expect(lines.every((one) => !one.includes("'browser' 'workbench-rec'"))).toBe(true);
  });

  it('★ 收工那一刻的关窗也走命令面：tab list / tab close 都带 --session', async () => {
    rig.setSurface({ ...opencliSurface, background: sessionLine });
    const capture = `${rig.root()}/workbench/artifacts/rec-demo.jsonl`;
    const record = heldStore(null, capture);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        ...armProbe({ phase: 'finished' }),
        { stdout: JSON.stringify({ ok: true, unhooked: 1, phase: 'finished', t0: 10, t1: 20, dropped: 0, calls: [POST()] }) },
        { stdout: JSON.stringify([{ page: 'p1', url: URL, title: '环境' }]) },
        { stdout: '{"closed":"p1"}' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_STOP_TOOL).execute({}, rig.diyExec())) as {
      cleaned: { readonly tab: boolean };
    };

    const closes = built.commands.filter((one) => one.includes("'tab'"));
    expect(out.cleaned.tab).toBe(true);
    expect(closes.length).toBeGreaterThan(0);
    for (const one of closes) expect(one).toContain("'--session'");
  });
});
