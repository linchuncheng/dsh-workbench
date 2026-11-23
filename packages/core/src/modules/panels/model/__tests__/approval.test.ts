import { describe, expect, it } from 'vitest';
import { DIY_PUBLISH_TOOL, PANELS_SHOW_TOOL } from '../../unit';
import { approvalVerdict, stopVerdictFor } from '../approval';
import { publishVerdictFor } from '../publish-approval';
import { panelsApprovalFor } from '../approval-policy';

describe('每一族的判定（approval.ts）', () => {
  it('外壳写工具：问到点子上的那一句交给调用方，工具本身说了算', () => {
    const verdict = approvalVerdict({ name: PANELS_SHOW_TOOL, arguments: { id: 'demo' } });

    expect(verdict?.kind).toBe('ask');
  });

  it('不是自己家的工具就不表态', () => {
    expect(approvalVerdict({ name: 'workbench_inventory_build', arguments: {} })).toBeUndefined();
  });

  it('长任务停机：没给落点、也没有落点可查时直接 allow（不拦）', () => {
    expect(stopVerdictFor({ name: 'workbench_long_tasks_stop', arguments: {} }, undefined)).toEqual({
      kind: 'allow',
    });
  });

  it('发布：只刷市集元数据（verify）不问', () => {
    expect(
      publishVerdictFor({ name: 'workbench_diy_publish', arguments: { verify: true } }, undefined),
    ).toEqual({ kind: 'allow' });
  });
});

describe('发布审批的预检', () => {
  const preview = () => ({
    ok: true as const,
    preview: { name: '@demo/probe', version: '0.1.0', registry: 'https://npm.demo.test/' },
  });

  it('★ 判定里带上预检：工作区、模块与这次参数原样交出去，只在要问的那条路上', async () => {
    const seen: unknown[] = [];
    const policy = panelsApprovalFor(undefined, undefined, preview, undefined, undefined, async (ask) => {
      seen.push(ask);
      return '发布前检查未通过，这次发布已拒绝（没有发起审批）：团队源尚未登录';
    });
    const call = { name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', category: '任务与协作' }, workspace: '/w/repo' };

    const verdict = policy(call);

    expect(verdict?.kind).toBe('ask');
    if (verdict?.kind !== 'ask') return;
    expect(await verdict.preflight?.()).toBe('发布前检查未通过，这次发布已拒绝（没有发起审批）：团队源尚未登录');
    expect(seen).toEqual([
      { unit: 'demo', workspace: '/w/repo', arguments: { unit: 'demo', category: '任务与协作' } },
    ]);
  });

  it('不问的那几条（verify / local）不带预检', () => {
    const policy = panelsApprovalFor(
      undefined,
      undefined,
      preview,
      undefined,
      undefined,
      async () => '不该跑到这里',
    );

    expect(policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', verify: true } })).toEqual({ kind: 'allow' });
    expect(policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', target: 'local' } })).toEqual({ kind: 'allow' });
  });
});
