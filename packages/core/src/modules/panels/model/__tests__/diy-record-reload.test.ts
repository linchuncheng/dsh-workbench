import { beforeEach, describe, expect, it } from 'vitest';
import type { DshHostContext, Seam } from '@dsh-workbench/shared/host';
import { flush, makeHarness, readPage, runScript, type FakeStorage, type Harness } from '../../__tests__/record-page-harness';
import { createDiyRig } from '../../__tests__/diy-harness';
import { POST, URL, armProbe, decodedLineOf, heldStore } from '../../__tests__/record-fixtures';
import { RECORD_ARM_SCRIPT, RECORD_KEEP_KEY } from '../diy-record-scripts';
import { watchRoundOf } from '../diy-record-watch';

const armedPage = (storage?: FakeStorage): Harness => {
  const harness = makeHarness(storage === undefined ? {} : { storage });
  runScript(RECORD_ARM_SCRIPT, harness);
  return harness;
};

const reloadedFrom = (first: Harness): Harness => makeHarness({ storage: first.storage });

describe('页面一刷新：浮条和钩子跟着文档一起没了，可那一份台账还在 sessionStorage 里', () => {
  it('★★★ 刷完先读：状态还在、录到的请求还在，但这页上没有浮条也没有钩子', async () => {
    const first = armedPage();
    await first.win.fetch('/api/publish', { method: 'POST', body: '{"title":"v1"}' });
    await flush();
    expect(first.storage.raw(RECORD_KEEP_KEY)?.['calls']).toHaveLength(1);

    const second = reloadedFrom(first);
    const page = await readPage(second);

    expect(page['ok']).toBe(true);
    expect(page['phase']).toBe('recording');
    expect(page['calls']).toHaveLength(1);
    expect(page['hooked']).toBe(false);
    expect(second.created.some((one) => one.id === '__dsh-record-bar')).toBe(false);
  });

  it('★★★ 再注入一次：浮条和钩子都回来，刷新前录到的请求一条不丢', async () => {
    const first = armedPage();
    await first.win.fetch('/api/publish', { method: 'POST', body: '{"title":"v1"}' });
    await flush();

    const second = reloadedFrom(first);
    await readPage(second);
    runScript(RECORD_ARM_SCRIPT, second);

    expect(second.created.some((one) => one.id === '__dsh-record-bar')).toBe(true);
    await second.win.fetch('/api/publish', { method: 'POST', body: '{"title":"v2"}' });
    await flush();

    const calls = second.storage.raw(RECORD_KEEP_KEY)?.['calls'] as Array<Record<string, unknown>>;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.['body']).toBe('{"title":"v1"}');
    expect(calls[1]?.['body']).toBe('{"title":"v2"}');
  });

  it('★★ 已经装着的页再注入一次：不套两层（一条请求还是只记一条）', async () => {
    const harness = armedPage();
    runScript(RECORD_ARM_SCRIPT, harness);
    await harness.win.fetch('/api/publish', { method: 'POST', body: '{"title":"v1"}' });
    await flush();

    expect(harness.storage.raw(RECORD_KEEP_KEY)?.['calls']).toHaveLength(1);
  });
});

describe('宿主守夜时发现文档被换掉：自己把浮条装回去，不用他重开一场', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
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

  const stalePage = (): string =>
    JSON.stringify({
      ok: true,
      phase: 'recording',
      t0: 1,
      t1: null,
      href: URL,
      here: URL,
      calls: [POST()],
      dropped: 0,
      shots: 0,
      hooked: false,
    });

  it('★★★ 读回来 hooked=false ⇒ 这一轮就重新注入，不结束、台账照旧', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: stalePage() }, ...armProbe({ phase: 'recording' })],
    });

    const out = await watchRoundOf(deps(built, record));
    const injected = built.commands.filter((one) => one.includes("'eval'")).map(decodedLineOf);

    expect(out.stop).toBe(false);
    expect(injected.some((one) => one.includes('__dsh-record-bar'))).toBe(true);
    expect(record.live(Date.now())?.phase).toBe('recording');
  });

  it('★★ 页面没报这个字段（旧载荷）⇒ 不当成要重装，照旧一轮一条 eval', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: JSON.stringify({ ok: true, phase: 'recording', t0: 1, t1: null, calls: [POST()] }) }],
    });

    const out = await watchRoundOf(deps(built, record));

    expect(out.stop).toBe(false);
    expect(built.commands).toHaveLength(1);
  });

  it('★★ 已经结束了的那一页就算钩子不在也不重装：该收尾收尾', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        {
          stdout: JSON.stringify({
            ok: true,
            phase: 'finished',
            t0: at,
            t1: at + 5,
            calls: [POST()],
            hooked: false,
          }),
        },
        { stdout: JSON.stringify({ ok: false, code: 'not-armed' }) },
      ],
    });

    const out = await watchRoundOf(deps(built, record));

    expect(out.stop).toBe(true);
    expect(record.live(Date.now())?.phase).toBe('finished');
    expect(built.commands.filter((one) => one.includes("'eval'")).map(decodedLineOf).some((one) => one.includes('正在准备录制'))).toBe(false);
  });
});
