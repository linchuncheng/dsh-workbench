import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BROWSER_RECORD_SESSION, WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared/host';
import { fakeSeamOf } from '../../__tests__/seam-fake';
import { takeHeldNotices } from '@/shared/api/host/diy-debug-act';
import { forgetRecordTab } from '../diy-record-tab';
import { createDiyRig } from '../../__tests__/diy-harness';
import type { ProbeStep } from '../../__tests__/diy-harness';
import { ARM_OK, POST, URL, heldStore, line } from '../../__tests__/record-fixtures';
import { RECORD_ARM_SCRIPTS } from '../diy-record-scripts';
import { releaseRecord, rememberWorkbenchApp } from '../diy-record';
import { watchFinishStepOf } from '../diy-record-watch';
import { DIY_RECORD_READ_TOOL, DIY_RECORD_STOP_TOOL } from '../../unit';

const writeCapture = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
};

const finishedPayload = (): string =>
  JSON.stringify({
    ok: true,
    unhooked: 1,
    phase: 'finished',
    t0: Date.now() - 5000,
    t1: Date.now(),
    href: URL,
    here: URL,
    dropped: 0,
    calls: [POST()],
  });

const markerOf = (command: string): string => {
  if (command.includes("'tab' 'list'")) return 'cmd:tab-list';
  if (command.includes("'tab' 'close'")) return 'cmd:tab-close';
  if (command.includes("'eval'")) return 'cmd:eval';
  return 'cmd:other';
};

function recordingShell(plan: readonly ProbeStep[], order: string[], snap = '{"ok":false,"code":"no-snap"}') {
  let index = 0;
  let snapEval = false;
  return {
    resolve(request: { command: string }) {
      order.push(markerOf(request.command));
      snapEval = request.command.includes("'no-snap'");
      return request;
    },
    async execute() {
      if (snapEval) {
        snapEval = false;
        return {
          result: async () => ({
            exitCode: 0,
            timedOut: false,
            aborted: false,
            stdout: { text: snap, truncated: false },
            stderr: { text: '', truncated: false },
          }),
        };
      }
      const step = plan[Math.min(index, plan.length - 1)] ?? {};
      index += 1;
      return {
        result: async () => ({
          exitCode: step.exitCode ?? 0,
          timedOut: step.timedOut ?? false,
          aborted: false,
          stdout: { text: step.stdout ?? '', truncated: false },
          stderr: { text: step.stderr ?? '', truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
}

describe('录制结束那一刻就关窗：先叫醒、再收掉那一扇', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    forgetRecordTab();
    rig.scaffold('demo');
    takeHeldNotices('s1');
  });

  const held = () => {
    const record = heldStore(null);
    const at = Date.now() - 60_000;
    record.started('s1', at, at);
    return record;
  };

  it('★★ 认到 finished ⇒ 先取快照、叫醒 agent、把工作台带回前台；**窗口留着**（收尾时才关）', async () => {
    const record = held();
    const order: string[] = [];
    const agents = {
      get: () => {
        order.push('notice');
        return undefined;
      },
    };
    const ctx = { get: (key: string) => (key === 'agents' ? agents : undefined) } as unknown as DshHostContext;
    const seam = fakeSeamOf(recordingShell(
      [
        { stdout: finishedPayload() },
        { stdout: JSON.stringify([{ page: 'p1', url: URL, title: '环境' }]) },
        { stdout: '{"closed":"p1"}' },
      ],
      order,
    ));

    const out = await watchFinishStepOf({
      ctx,
      seam,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: true });
    expect(order).toEqual(['cmd:eval', 'cmd:eval', 'notice']);
    expect(takeHeldNotices('s1')).toHaveLength(1);
  });

  it('★★ 读到的 finished 比这一场还早（上一场留在 sessionStorage 里）⇒ 不算结束，先擦掉重注入', async () => {
    const record = held();
    const order: string[] = [];
    const stale = JSON.stringify({
      ok: true,
      phase: 'finished',
      t0: 10,
      t1: 20,
      href: URL,
      here: URL,
      dropped: 0,
      calls: [POST()],
    });
    const seam = fakeSeamOf(
      recordingShell(
        [
          { stdout: stale },
          { stdout: '{"ok":true}' },
          ...RECORD_ARM_SCRIPTS.map(() => ({ stdout: '{"ok":true}' })),
        ],
        order,
      ),
    );

    const out = await watchFinishStepOf({
      ctx: { get: () => undefined } as unknown as DshHostContext,
      seam,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: false, delivered: false });
    expect(record.live(Date.now())?.phase).toBe('recording');
    expect(order).toHaveLength(RECORD_ARM_SCRIPTS.length + 2);
  });

  it('★★ 那一页已经没了（eval 报错 + tab list 是空的）⇒ 收工，不再每拍都去撞一次', async () => {
    const record = held();
    const order: string[] = [];
    const seam = fakeSeamOf(recordingShell(
      [
        { stdout: '{"ok":false,"error":{"code":"UNKNOWN","message":"Target tab p1 is not part of the current browser session."}}', exitCode: 1 },
        { stdout: '{"ok":true,"data":[]}' },
        { stdout: '{"ok":true}' },
      ],
      order,
    ));

    const out = await watchFinishStepOf({
      ctx: { get: () => undefined } as unknown as DshHostContext,
      seam,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out.stop).toBe(true);
    expect(order).toContain('cmd:tab-list');
  });

  it('★★ 会话捕获一条都没落时，先把钩子那几条写进捕获文件再关窗（关掉就再也读不到了）', async () => {
    const record = held();
    const order: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), 'wb-rec-close-'));
    const captureFile = join(dir, 'rec-demo.jsonl');

    await watchFinishStepOf({
      ctx: { get: () => undefined } as unknown as DshHostContext,
      seam: fakeSeamOf(
        recordingShell(
          [
            { stdout: finishedPayload() },
            { stdout: JSON.stringify([{ page: 'p1', url: URL, title: '环境' }]) },
            { stdout: '{"closed":"p1"}' },
          ],
          order,
        ),
      ),
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile,
    });

    expect(existsSync(captureFile)).toBe(true);
    expect(readFileSync(captureFile, 'utf8')).toContain('publish');
  });

  it('★★ 用户按「结束」⇒ 把工作台带回前台（不然他找不到对话），录制的窗口留在那儿', async () => {
    const record = held();
    const order: string[] = [];
    const brought: string[] = [];
    const ctx = {
      get: (key: string) =>
        key === WORKBENCH_ADAPTERS
          ? {
              runtime: {
                bringToFront: async (_ctx: unknown, app: string) => {
                  brought.push(app);
                  return true;
                },
              },
            }
          : undefined,
    } as unknown as DshHostContext;
    rememberWorkbenchApp('DeepSeek Harness');

    const out = await watchFinishStepOf({
      ctx,
      seam: fakeSeamOf(
        recordingShell(
          [
            { stdout: finishedPayload() },
            { stdout: JSON.stringify([{ page: 'p1', url: URL, title: '环境' }]) },
            { stdout: '{"closed":"p1"}' },
          ],
          order,
        ),
      ),
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: true });
    expect(brought).toEqual(['DeepSeek Harness']);
    expect(order).toEqual(['cmd:eval', 'cmd:eval']);
  });

  it('★★ 收尾那一拍才关窗：认准记住的那一扇，同窗那个 about:blank 一起收掉', async () => {
    const order: string[] = [];
    const seam = fakeSeamOf(
      recordingShell(
        [
          {
            stdout: JSON.stringify([
              { page: 'blank', url: 'about:blank', title: 'about:blank' },
              { page: 'p1', url: URL, title: '环境' },
            ]),
          },
          { stdout: '{"closed":"p1"}' },
          { stdout: '{"closed":"blank"}' },
          { stdout: '{"ok":true,"data":[]}' },
        ],
        order,
      ),
    );

    const cleaned = await releaseRecord({
      seam,
      command: '',
      session: BROWSER_RECORD_SESSION,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
      tab: 'p1',
    });

    expect(cleaned.tab).toBe(true);
    expect(order).toEqual(['cmd:tab-list', 'cmd:tab-close', 'cmd:tab-close', 'cmd:tab-list', 'cmd:other']);
  });

  it('★ 快照那一拍炸了（shell 没了）⇒ 照旧叫醒、照旧收工，不把这一段丢掉', async () => {
    const ctx = { get: () => undefined } as unknown as DshHostContext;
    const order: string[] = [];

    let calls = 0;
    const throwing = {
      resolve: (request: { command: string }) => {
        order.push(markerOf(request.command));
        return request;
      },
      async execute() {
        calls += 1;
        if (calls > 1) throw new Error('shell 没了');
        return {
          result: async () => ({
            exitCode: 0,
            timedOut: false,
            aborted: false,
            stdout: { text: finishedPayload(), truncated: false },
            stderr: { text: '', truncated: false },
          }),
        };
      },
    } as unknown as DshShell;

    const boom = await watchFinishStepOf({
      ctx,
      seam: fakeSeamOf(throwing),
      command: '',
      sessionId: 's1',
      store: held(),
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(boom).toEqual({ stop: true, delivered: true });
  });

  it('★★ 窗口已经关了之后读那一段：不抛、清单照旧（正文里是清单，不是"读不到"）', async () => {
    const capture = join(rig.root(), 'workbench', 'artifacts', 'rec-demo.jsonl');
    writeCapture(capture, `${line('POST', `${URL}/api/publish`, 15)}\n`);
    const record = heldStore(null, capture);
    record.started('s1', 1, Date.now());
    record.finished('s1', 100, Date.now());
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as {
      rows: readonly unknown[];
      text: string;
    };

    expect(out.rows).toHaveLength(1);
    expect(out.text).toContain('录完了 · 1 条（⭐ 1）');
    expect(out.text).toContain('录制窗口先留着');
    expect(out.text).toContain('POST');
  });

  it('★★ 他没按「开始」就按了「结束」⇒ 台账也要落到 finished（区间从 0 起），不然读那一段会去碰页面、opencli 又补一个空白标签', async () => {
    const record = heldStore(null);
    const order: string[] = [];
    const ctx = { get: () => undefined } as unknown as DshHostContext;
    const closed = finishedPayload();

    const out = await watchFinishStepOf({
      ctx,
      seam: fakeSeamOf(recordingShell(
        [
          { stdout: closed },
          { stdout: '[]' },
        ],
        order,
      )),
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: true });
    expect(record.live(Date.now())?.phase).toBe('finished');
    expect(record.live(Date.now())?.t0).toBe((JSON.parse(closed) as { t0: number }).t0);
  });

  it('★★ 页面从来没开始过（`t0` 是 null）也封口：区间从 0 起 —— 那一段的请求一条都不许被筛掉', async () => {
    const record = heldStore(null);
    const ctx = { get: () => undefined } as unknown as DshHostContext;

    const out = await watchFinishStepOf({
      ctx,
      seam: fakeSeamOf(recordingShell(
        [
          {
            stdout: JSON.stringify({
              ok: true,
              unhooked: 1,
              phase: 'finished',
              t0: null,
              t1: Date.now(),
              href: URL,
              here: URL,
              dropped: 0,
              calls: [],
            }),
          },
          { stdout: '[]' },
        ],
        [],
      )),
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: true });
    expect(record.live(Date.now())?.phase).toBe('finished');
    expect(record.live(Date.now())?.t0).toBe(0);
  });

  it('★ 已经 finished 的那一场：看护那一拍先补读页面钩子、再补快照就收工（窗口照旧留着，等收尾）', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    record.finished('s1', at + 5, at + 5);
    const order: string[] = [];
    const seam = fakeSeamOf(recordingShell([{ stdout: '{"ok":false,"code":"no-snap"}' }, { stdout: '[]' }], order));

    const out = await watchFinishStepOf({
      ctx: { get: () => undefined } as unknown as DshHostContext,
      seam,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: false });
    expect(order).toEqual(['cmd:eval', 'cmd:eval']);
  });

  it('★★★ 结束那一刻先把表单快照取走：页面下一秒可能就跳走，宿主不追着要就永远拿不到了', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-snap-'));
    const captureFile = join(dir, 'rec-demo.jsonl');
    writeFileSync(captureFile, '', 'utf8');
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    record.finished('s1', at + 5, at + 5);
    const order: string[] = [];
    const snap = {
      ok: true,
      href: URL,
      title: '新建工单',
      at,
      bytes: 42,
      truncated: false,
      html: '<form><input name="title" required></form>',
      fields: [{ name: 'title', label: '标题', kind: 'input', required: true, filled: false, value: '', options: [] }],
    };
    const seam = fakeSeamOf(recordingShell([{ stdout: '[]' }], order, JSON.stringify(snap)));

    await watchFinishStepOf({
      ctx: { get: () => undefined } as unknown as DshHostContext,
      seam,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile,
    });

    expect(order).toEqual(['cmd:eval', 'cmd:eval']);
    expect(readFileSync(join(dir, 'rec-demo-form.html'), 'utf8')).toContain('name="title"');
    expect(JSON.parse(readFileSync(join(dir, 'rec-demo-form.json'), 'utf8'))['fields']).toHaveLength(1);
  });

  it('★ releaseRecord 仍然 tolerant：标签已经不在（空列表）⇒ 不报"收窗失败"', async () => {
    const fake = rig.fakeShell([{ stdout: '' }, { stdout: '[]' }]);

    const cleaned = await releaseRecord({
      seam: fakeSeamOf(fake.shell),
      command: '',
      session: BROWSER_RECORD_SESSION,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(cleaned).toEqual({ tab: true, capture: false });
  });

  it('★ 收工那一拍也不自相矛盾：标签已被结束那一拍关掉 ⇒ 话说"收掉了"，不说"没关掉"', async () => {
    const record = heldStore(null);
    record.started('s1', 1, Date.now());
    record.finished('s1', 100, Date.now());
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: ARM_OK({ phase: 'finished' }) },
        { stdout: finishedPayload() },
        { stdout: '1\n' },
        { stdout: line('POST', `${URL}/api/publish`, 15) },
        { stdout: 'ok\n' },
        { stdout: '' },
        { stdout: '' },
        { stdout: '[]' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_STOP_TOOL).execute({ force: true, forceWhy: '夹具里没有表单快照' }, rig.diyExec())) as {
      cleaned: { readonly tab: boolean; readonly capture: boolean };
      text: string;
    };

    expect(out.cleaned.tab).toBe(true);
    expect(out.text).toContain('录制窗口的标签已关闭');
    expect(out.text).not.toContain('那个标签没关掉');
  });
});
