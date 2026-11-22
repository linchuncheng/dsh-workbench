import { describe, expect, it, vi } from 'vitest';
import type { Need, Seam, UnitCapability } from '@dsh-workbench/shared/host';
import type { UnitProbeOptions } from '../unit-probe';
import { createUnitProbe } from '../unit-probe';

const extension: Need = { kind: 'extension', runtime: 'opencli', name: 'demo', purpose: '测试' };

const seam = {} as unknown as Seam;

function capabilityOf(unit: string): UnitCapability {
  return { unit, status: 'missing', needs: [] };
}

describe('单元探针：按声明探，不要求单元已经注册', () => {
  it('★ 单元不在注册表里、但给了声明：照探，并把结论挂上 released', async () => {
    const probe = vi.fn(async (_options: UnitProbeOptions) => [capabilityOf('argocd')]);
    const probeOne = createUnitProbe({
      seam,
      runtimeCommands: { opencli: 'opencli' },
      inputs: () => [],
      released: () => true,
      probe,
    });

    const found = await probeOne('argocd', true, [extension]);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0]?.[0]).toMatchObject({
      force: true,
      units: [{ unit: 'argocd', needs: [extension] }],
    });
    expect(found).toMatchObject({ unit: 'argocd', status: 'missing', released: true });
  });

  it('注册表里已经有它 → 探的是整张表，不是只补一条', async () => {
    const probe = vi.fn(async (_options: UnitProbeOptions) => [capabilityOf('argocd'), capabilityOf('issues')]);
    const probeOne = createUnitProbe({
      seam,
      runtimeCommands: {},
      inputs: () => [
        { unit: 'issues', needs: [extension] },
        { unit: 'argocd', needs: [extension] },
      ],
      released: () => false,
      probe,
    });

    await probeOne('argocd');

    expect(probe.mock.calls[0]?.[0]?.units.map((input) => input.unit)).toEqual(['issues', 'argocd']);
  });

  it('没声明也没注册 → 不探，直接给不出结论', async () => {
    const probe = vi.fn(async (_options: UnitProbeOptions) => []);
    const probeOne = createUnitProbe({ seam, runtimeCommands: {}, inputs: () => [], released: () => false, probe });

    expect(await probeOne('ghost')).toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });
});
