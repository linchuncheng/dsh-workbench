import { describe, expect, it } from 'vitest';
import { createDiagRecorder, type ProvisionHandler } from '@dsh-workbench/shared/host';
import { withDiagProvision } from '../diag-provision.js';

function recorderOf() {
  let at = 1_000;
  return createDiagRecorder({ clock: () => (at += 10), nextCorrId: () => 'c-1', level: 'info' });
}

describe('安装失败：落一条诊断记录', () => {
  it('★ 处理器回 ok:false 时记 SUPPLY_INSTALL_FAILED，结果原样返回，同一请求只记一次', async () => {
    const diag = recorderOf();
    const inner: ProvisionHandler = { handle: () => ({ ok: false, error: { code: 'x', message: 'y' } }) };
    const wrapped = withDiagProvision(inner, diag);
    const request = { action: 'install' as const, unit: 'inventory' };

    const first = await wrapped.handle(request);
    await wrapped.handle(request);

    expect(first).toEqual({ ok: false, error: { code: 'x', message: 'y' } });
    const records = diag.recent({ code: 'SUPPLY_INSTALL_FAILED' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ class: 'env', area: 'supply', subject: { unit: 'inventory' } });
  });

  it('★ 处理器回 ok:true 但安装结果是 failed → 也记一条（不许「安装失败但诊断里什么都没有」）', async () => {
    const diag = recorderOf();
    const inner: ProvisionHandler = {
      handle: () => ({
        ok: true,
        change: {
          application: 'failed',
          stage: 'install',
          changed: false,
          target: '@a/mod',
          errorCode: 'not-bundle',
          errorDetail: 'declares no bundle',
        },
      }),
    };
    const wrapped = withDiagProvision(inner, diag);

    await wrapped.handle({ action: 'install-bundle' as const, spec: '@a/mod@1.1.9' });

    const records = diag.recent({ code: 'SUPPLY_INSTALL_FAILED' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      class: 'env',
      area: 'supply',
      subject: { pkg: '@a/mod@1.1.9' },
      detail: { action: 'install-bundle', reason: 'not-bundle', stage: 'install' },
    });
  });

  it('成功时零记录，affectedUnits 等其余成员保持不变', async () => {
    const diag = recorderOf();
    const inner: ProvisionHandler = {
      handle: () => ({ ok: true }),
      affectedUnits: () => ['inventory'],
    };
    const wrapped = withDiagProvision(inner, diag);

    await wrapped.handle({ action: 'install' as const, unit: 'inventory' });

    expect(diag.recent()).toHaveLength(0);
    expect(wrapped.affectedUnits?.({ action: 'install' as const, unit: 'inventory' })).toEqual(['inventory']);
  });
});
