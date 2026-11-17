import { describe, expect, it } from 'vitest';
import type { Need, UnitCapability } from '@dsh-workbench/shared/host';
import { dependencyRowActions, detailDependenciesOf } from '../market-detail-deps';

function capabilityOf(
  needs: readonly { kind?: string; name: string; status: string; installed?: string; latest?: string }[],
): UnitCapability {
  return {
    unit: 'demo',
    status: 'ok',
    detail: '夹具',
    needs: needs.map((need) => ({
      id: `${need.kind ?? 'extension'}:${need.name}`,
      kind: (need.kind ?? 'extension') as UnitCapability['needs'][number]['kind'],
      name: need.name,
      status: need.status as UnitCapability['needs'][number]['status'],
      detail: '夹具',
      ...(need.installed === undefined ? {} : { installed: need.installed }),
      ...(need.latest === undefined ? {} : { latest: need.latest }),
    })),
  };
}

describe('详情页的依赖一栏', () => {
  it('没有探测结果：一行都不列（不编造）', () => {
    expect(detailDependenciesOf(undefined)).toEqual([]);
  });

  it('照着探测结果列：名字、装的是什么、源上最新', () => {
    const rows = detailDependenciesOf(
      capabilityOf([{ name: 'workflow', status: 'outdated', installed: '1.1.22', latest: '1.1.23' }]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      kind: 'extension',
      name: 'workflow',
      status: 'outdated',
      installed: '1.1.22',
      latest: '1.1.23',
    });
  });

  it('每行自己的动作：缺件给「安装」，旧了给「升级依赖」，好的不给', () => {
    const [missing] = detailDependenciesOf(capabilityOf([{ name: 'a', status: 'missing' }]));
    const [stale] = detailDependenciesOf(
      capabilityOf([{ name: 'a', status: 'outdated', installed: '1.0.0', latest: '1.1.0' }]),
    );
    const [fine] = detailDependenciesOf(
      capabilityOf([{ name: 'a', status: 'ok', installed: '1.1.0', latest: '1.1.0' }]),
    );

    expect(dependencyRowActions(missing as never)).toEqual(['install']);
    expect(dependencyRowActions(stale as never)).toEqual(['update-dependency']);
    expect(dependencyRowActions(fine as never)).toEqual([]);
  });

  it('★★ 环境变量与可执行文件不归我们装：缺了也不给「安装」', () => {
    const [env] = detailDependenciesOf(capabilityOf([{ kind: 'env', name: 'CMDB_ID', status: 'missing' }]));
    const [bin] = detailDependenciesOf(capabilityOf([{ kind: 'bin', name: 'gh', status: 'missing' }]));
    const [lib] = detailDependenciesOf(capabilityOf([{ kind: 'lib', name: 'date-fns', status: 'missing' }]));

    expect(dependencyRowActions(env as never)).toEqual([]);
    expect(dependencyRowActions(bin as never)).toEqual([]);
    expect(dependencyRowActions(lib as never)).toEqual(['install']);
  });
});

describe('可选与未设置', () => {
  it('清单里写了 required: false 的，行上带 optional 标记', () => {
    const declared: readonly Need[] = [
      { kind: 'env', name: 'A_TOKEN', purpose: '夹具', required: false },
      { kind: 'env', name: 'B_TOKEN', purpose: '夹具' },
    ];
    const capability: UnitCapability = {
      unit: 'demo',
      status: 'ok',
      detail: '夹具',
      needs: [
        { id: 'env:A_TOKEN', kind: 'env', name: 'A_TOKEN', status: 'missing', detail: '夹具' },
        { id: 'env:B_TOKEN', kind: 'env', name: 'B_TOKEN', status: 'missing', detail: '夹具' },
      ],
    };

    const rows = detailDependenciesOf(capability, declared);

    expect(rows[0]?.optional).toBe(true);
    expect(rows[1]?.optional).toBeUndefined();
  });

  it('没给清单：一个 optional 都不乱标', () => {
    const rows = detailDependenciesOf(capabilityOf([{ name: 'x', status: 'missing' }]));
    expect(rows[0]?.optional).toBeUndefined();
  });
});
