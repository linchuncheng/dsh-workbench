import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ deployment: undefined as 'desktop' | 'web' | undefined }));

vi.mock('@/shared/hooks/use-runtime-capabilities', () => ({
  hostSurfaceValue: () =>
    state.deployment === undefined ? undefined : { deployment: state.deployment },
}));

const { hostActionKey, hostLabel, hostRequirementParams } = await import('../host-requirement');

describe('宿主相关的兼容性文案', () => {
  it('★ 桌面端说 DeepSeek Harness，网页端说 dsh', () => {
    state.deployment = 'desktop';
    expect(hostLabel()).toBe('DeepSeek Harness');
    expect(hostActionKey()).toBe('panels.market.needsHostAction.desktop');

    state.deployment = 'web';
    expect(hostLabel()).toBe('dsh');
    expect(hostActionKey()).toBe('panels.market.needsHostAction.dsh');

    state.deployment = undefined;
    expect(hostLabel()).toBe('dsh');
  });

  it('★ 只把版本拿出来给用户看：区间前缀去掉，复杂区间原样兜底', () => {
    expect(hostRequirementParams({ 'engines.dsh': '>=0.2.3-alpha.2' }, '0.2.2-rc.5')).toEqual({
      host: 'dsh',
      version: '0.2.3-alpha.2',
      runtime: '0.2.2-rc.5',
    });
    expect(hostRequirementParams({ 'engines.dsh': '^0.2.3' }, '0.2.2')).toMatchObject({
      version: '0.2.3',
    });
    expect(hostRequirementParams({ 'engines.dsh': '>=0.2.3 <0.3' }, '0.2.2')).toMatchObject({
      version: '>=0.2.3 <0.3',
    });
  });

  it('★ 缺要求或缺当前版本 → 不给这句，交给上层兜底', () => {
    expect(hostRequirementParams(undefined, '0.2.2')).toBeUndefined();
    expect(hostRequirementParams({ 'engines.dsh': '>=0.2.3' }, undefined)).toBeUndefined();
  });
});
