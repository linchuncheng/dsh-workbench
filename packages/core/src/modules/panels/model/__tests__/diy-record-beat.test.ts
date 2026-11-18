import { beforeEach, describe, expect, it } from 'vitest';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared/host';
import type { Seam } from '@dsh-workbench/shared/host';
import { takeHeldNotices } from '@/shared/api/host/diy-debug-act';
import { createDiyRig } from '../../__tests__/diy-harness';
import { POST, URL, heldStore } from '../../__tests__/record-fixtures';
import { STATIC_URL_PATTERN } from '../diy-record';
import { watchRecordFinish, watchRoundOf } from '../diy-record-watch';
import { fakeSeamOf } from '../../__tests__/seam-fake';

const recording = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ ok: true, phase: 'recording', t0: 1, t1: null, calls: [], ...extra });

const finishedPage = (at: number): string =>
  JSON.stringify({ ok: true, phase: 'finished', t0: at, t1: at + 5, calls: [POST()] });

describe('录制交接的轮询：一轮一条 eval，页面说结束了就做收尾那一拍', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
    takeHeldNotices('s1');
  });

  const deps = (built: ReturnType<ReturnType<typeof createDiyRig>['harness']>, record: ReturnType<typeof heldStore>) => ({
    ctx: built.ctx as unknown as DshHostContext,
    seam: built.ctx.get('workbenchSeam') as unknown as Seam,
    command: '',
    sessionId: 's1',
    store: record,
    url: URL,
    captureFile: '/w/shots/rec-demo.jsonl',
  });

  const settle = async (): Promise<void> => {
    for (let round = 0; round < 6; round += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('★★ 每一轮恰好一条 `eval`（没有 `wait`、不记台账），还在录就继续排下一轮', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: recording({ t0: at }) }],
    });

    const out = await watchRoundOf(deps(built, record));

    expect(out.stop).toBe(false);
    expect(built.commands).toHaveLength(1);
    expect(built.commands[0]).toContain("'eval'");
    expect(built.commands[0]).toContain(BROWSER_RECORD_SESSION);
    expect(built.commands[0]).not.toContain("'wait'");
    expect(record.live(Date.now())?.phase).toBe('recording');
  });

  it('★ 结束那一刻：封口 + 叫醒 + 取快照 + 收工，**不再排下一轮**；窗口不动', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: recording({ t0: at }) }, { stdout: finishedPage(at) }],
    });

    watchRecordFinish(deps(built, record));
    await settle();

    expect(built.commands.some((one) => one.includes("'tab' 'close'"))).toBe(false);
    expect(built.commands.some((one) => one.includes('.pid'))).toBe(false);
    expect(record.live(Date.now())?.phase).toBe('finished');
  });

  it('★ 读页面那一拍自己抛了（shell 没了）⇒ 不丢兜底、台账不动', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const broken = {
      resolve: (spec: unknown) => spec,
      execute: () => Promise.reject(new Error('shell 没了')),
    } as unknown as DshShell;

    const out = await watchRoundOf({
      ctx: {} as DshHostContext,
      seam: fakeSeamOf(broken),
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out.stop).toBe(false);
    expect(record.live(Date.now())?.phase).toBe('recording');
  });

  it('★ 捕获那行的 URL 过滤仍然滤静态资源，且**不再需要**"门铃"那一条（没有那条请求了）', () => {
    const re = new RegExp(STATIC_URL_PATTERN, 'i');

    expect(re.test('https://inventory.example.com/assets/app.js')).toBe(true);
    expect(re.test('data:image/png;base64,AAAA')).toBe(true);
    expect(re.test('https://inventory.example.com/api/publish')).toBe(false);
    expect(STATIC_URL_PATTERN).not.toContain('__dsh_beat');
  });
});
