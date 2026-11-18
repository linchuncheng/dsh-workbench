import { beforeEach, describe, expect, it } from 'vitest';
import type { DshHostContext, Seam } from '@dsh-workbench/shared/host';
import { createDiyRig } from '../../__tests__/diy-harness';
import { POST, URL, heldStore } from '../../__tests__/record-fixtures';
import { watchRoundOf } from '../diy-record-watch';

const pageOf = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ ok: true, phase: 'recording', t0: 1, t1: null, calls: [POST()], shots: 0, ...extra });

describe('他自己按「截图」：一次按一次落图，不按不落', () => {
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
    captureFile: '/w/diy/shots/rec-demo.jsonl',
  });

  it('★★ 计数涨了 ⇒ 一条 `screenshot` 落成 rec-shot-<unit>-<n>.png，记账跟到那一个数', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({ withTools: true, pact: false, record, probe: [{ stdout: pageOf({ shots: 1 }) }] });

    await watchRoundOf(deps(built, record));

    const shots = built.commands.filter((one) => one.includes("'screenshot'"));
    expect(shots).toHaveLength(1);
    expect(built.commands.join('\n')).toContain(`rec-shot-demo-${Math.floor(at / 1000).toString(36)}-1.png`);
    expect(record.live(Date.now())?.shotsSeen).toBe(1);
  });

  it('★★ 同一个计数不再重发（一轮一条，不因为下一轮又看到它就再落一张）', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: pageOf({ shots: 1 }) }, { stdout: pageOf({ shots: 1 }) }],
    });

    await watchRoundOf(deps(built, record));
    await watchRoundOf(deps(built, record));

    expect(built.commands.filter((one) => one.includes("'screenshot'"))).toHaveLength(1);
    expect(record.live(Date.now())?.shotsSeen).toBe(1);
  });

  it('★★ 没按过就不落图（不给用户攒一堆没意义的图）', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({ withTools: true, pact: false, record, probe: [{ stdout: pageOf() }] });

    await watchRoundOf(deps(built, record));

    expect(built.commands.filter((one) => one.includes("'screenshot'"))).toHaveLength(0);
    expect(record.live(Date.now())?.shotsSeen).toBe(0);
  });
});
