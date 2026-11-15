import { describe, expect, it, vi } from 'vitest';
import type { DataReader, RecipeResults, RequestPlan, RequestRecipe } from '../../../contract/data.js';
import { scopedDataReader } from '../unit-data.js';

function readerOf(overrides: Partial<DataReader> = {}): DataReader {
  return {
    read: async <T = unknown>() => ({ ok: true, data: 'read' as T }),
    request: async <T = unknown>() => ({ ok: true, data: 'request' as T }),
    requestMany: async () => ({ one: { ok: true, data: 1 } }) as never,
    plan: async () => ({ one: { ok: true, data: 2 } }),
    submitPlan: async () => ({ one: { ok: true, data: 3 } }),
    submit: async <T = unknown>() => ({ ok: true, data: 'submit' as T }),
    ...overrides,
  };
}

const plan: RequestPlan = {
  origin: 'https://a.example.com',
  steps: [{ name: 'one', request: { method: 'GET', path: '/x' } }],
};

describe('scopedDataReader', () => {
  it('没声明 origins 时原样放行（兼容旧模块）', () => {
    const data = readerOf();
    expect(scopedDataReader(data, undefined)).toBe(data);
  });

  it('只给站点表时，放行面由站点 origin 推导', async () => {
    const sites = { oa: { origin: 'https://a.example.com' } };
    const scoped = scopedDataReader(readerOf(), undefined, sites);
    expect(
      await scoped.read({ kind: 'http', url: 'https://a.example.com/x' }),
    ).toMatchObject({ ok: true, data: 'read' });
    expect(
      await scoped.read({ kind: 'http', url: 'https://b.example.com/x' }),
    ).toMatchObject({ ok: false, error: { pageCode: 'origin-not-declared' } });
  });

  it('声明了就只放行声明的 origin，plan 整支失败', async () => {
    const inner = readerOf();
    const scoped = scopedDataReader(inner, ['https://a.example.com']);
    const ok = await scoped.plan(plan);
    expect(ok['one']).toMatchObject({ ok: true, data: 2 });
    const denied = await scoped.plan({ ...plan, origin: 'https://b.example.com' });
    expect(denied['one']).toMatchObject({ ok: false, error: { code: 'invalid-request', pageCode: 'origin-not-declared' } });
  });

  it('request / submit / read 也检查 origin', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const recipe = { origin: 'https://b.example.com', request: { method: 'GET' as const, path: '/x' } };
    expect(await scoped.request(recipe)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(await scoped.submit(recipe)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(await scoped.read({ kind: 'http', url: 'https://b.example.com/x' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-request' },
    });
    expect(await scoped.read({ kind: 'http', url: 'https://a.example.com/x' })).toMatchObject({ ok: true, data: 'read' });
  });

  it('origin 解析不了就拒，不是放行', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const recipe = { origin: 'not a url', request: { method: 'GET' as const, path: '/x' } };
    expect(await scoped.request(recipe)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(await scoped.plan({ origin: 'not a url', steps: [{ name: 'one', request: { method: 'GET', path: '/x' } }] })).toMatchObject({
      one: { ok: false },
    });
  });

  it('写路径的拒绝文案说写，不说读', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const recipe = { origin: 'https://b.example.com', request: { method: 'POST' as const, path: '/x' } };
    const denied = await scoped.submit(recipe);
    expect(denied.ok ? '' : denied.error.message).toContain('没声明写');
  });

  it('requestMany 也按 origin 拒，形状与真实读口一致', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const recipe = { origin: 'https://b.example.com', request: { method: 'GET' as const, path: '/x' } };
    const out = await scoped.requestMany(recipe, { one: {}, two: {} });
    expect(Object.keys(out).sort()).toEqual(['one', 'two']);
    expect(out['one']).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
  });

  it('browser 的 url 是空串时按「没有 url」处理，不校验', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    expect(await scoped.read({ kind: 'browser', script: '1', url: '' })).toMatchObject({ ok: true, data: 'read' });
    expect(await scoped.read({ kind: 'browser', script: '1' })).toMatchObject({ ok: true, data: 'read' });
  });

  it('计划形状不对时只回 invalid-request，不抛', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const out = await scoped.plan({ steps: [] } as never);
    expect(Object.values(out)).toEqual([]);
    const spy = await scoped.plan(null as never);
    expect(spy).toEqual({});
  });

  it('空 origins = 一个都不放行', async () => {
    const scoped = scopedDataReader(readerOf(), []);
    expect(await scoped.plan(plan)).toMatchObject({ one: { ok: false } });
  });

  it('submitPlan 也受 origin 约束', async () => {
    const submitPlan = vi.fn(async () => ({ one: { ok: true as const, data: 'written' } }));
    const scoped = scopedDataReader(readerOf({ submitPlan }), ['https://a.example.com']);
    const denied = await scoped.submitPlan(
      { ...plan, origin: 'https://b.example.com', steps: [{ ...plan.steps[0]!, request: { method: 'POST', path: '/x' } }] },
      { idempotencyKey: 'k', confirm: () => true },
    );
    expect(denied['one']).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(submitPlan).not.toHaveBeenCalled();
  });
});

describe('scopedDataReader 按站点表解析', () => {
  const sites = {
    a: {
      origin: 'https://a.example.com',
      loginUrl: 'https://a.example.com/login',
      session: 'a-read',
      timeoutMs: 10_000,
      authLoss: { path: 'errorCode', equals: '002' },
    },
  };
  const recipe = { site: 'a', request: { method: 'GET' as const, path: '/x' } };
  const sitePlan: RequestPlan = {
    site: 'a',
    steps: [{ name: 'one', request: { method: 'GET', path: '/x' } }],
  };

  it('只写 site 的配方到达底层时已带 origin / loginUrl / authLoss', async () => {
    let seen: RequestRecipe | undefined;
    const request = async <T = unknown>(recipe: RequestRecipe) => {
      seen = recipe;
      return { ok: true as const, data: 'ok' as T };
    };
    const scoped = scopedDataReader(readerOf({ request }), ['https://a.example.com'], sites);
    await scoped.request(recipe);

    expect(seen).toEqual(
      expect.objectContaining({
        origin: 'https://a.example.com',
        loginUrl: 'https://a.example.com/login',
        session: 'a-read',
        timeoutMs: 10_000,
        authLoss: { path: 'errorCode', equals: '002' },
      }),
    );
  });

  it('只写 site 的计划不会被 shapedPlan 误判，且解析后再收口', async () => {
    const planFn = vi.fn(async () => ({ one: { ok: true as const, data: 1 } }));
    const scoped = scopedDataReader(readerOf({ plan: planFn }), ['https://a.example.com'], sites);
    const out = await scoped.plan(sitePlan);

    expect(out['one']).toMatchObject({ ok: true });
    expect(planFn).toHaveBeenCalledWith(expect.objectContaining({ origin: 'https://a.example.com' }), undefined);
  });

  it('未知站点回 site-undeclared，requestMany 每格同形', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com'], sites);
    expect(await scoped.request({ ...recipe, site: 'nope' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-request', pageCode: 'site-undeclared' },
    });
    const many = await scoped.requestMany({ ...recipe, site: 'nope' }, { one: {}, two: {} });
    expect(many['one']).toMatchObject({ ok: false, error: { pageCode: 'site-undeclared' } });
    expect(many['two']).toMatchObject({ ok: false, error: { pageCode: 'site-undeclared' } });
  });

  it('站点已声明但 origin 不在名单里：仍回 origin-not-declared', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://other.example.com'], sites);
    expect(await scoped.request(recipe)).toMatchObject({
      ok: false,
      error: { code: 'invalid-request', pageCode: 'origin-not-declared' },
    });
  });

  it('requestMany 解析成功后每格各自成败', async () => {
    const requestMany = async <T = unknown>(): Promise<RecipeResults<T>> => ({
      one: { ok: true as const, data: 1 as T },
      two: { ok: false as const, error: { code: 'http' as const, message: 'x' } },
    });
    const scoped = scopedDataReader(readerOf({ requestMany }), ['https://a.example.com'], sites);
    const out = await scoped.requestMany(recipe, { one: {}, two: {} });

    expect(out['one']).toMatchObject({ ok: true });
    expect(out['two']).toMatchObject({ ok: false, error: { code: 'http' } });
  });

  it('清单没有站点表却写了 site：也回 site-undeclared，不落到 undefined', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    expect(await scoped.request(recipe)).toMatchObject({
      ok: false,
      error: { code: 'invalid-request', pageCode: 'site-undeclared' },
    });
  });

  it('畸形读请求 / calls 不同步抛', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com'], sites);
    expect(await scoped.read(null as never)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    await expect(scoped.requestMany({ ...recipe, site: 'nope' }, null as never)).resolves.toEqual({});
    const allowed = scopedDataReader(readerOf(), ['https://a.example.com'], sites);
    await expect(allowed.requestMany(recipe, null as never)).resolves.toBeTruthy();
  });

  it('写路径同样解析站点', async () => {
    let seen: RequestRecipe | undefined;
    const submit = async <T = unknown>(recipe: RequestRecipe) => {
      seen = recipe;
      return { ok: true as const, data: 'ok' as T };
    };
    const scoped = scopedDataReader(readerOf({ submit }), ['https://a.example.com'], sites);
    await scoped.submit({ ...recipe, request: { method: 'POST', path: '/x' } });

    expect(seen).toEqual(expect.objectContaining({ origin: 'https://a.example.com' }));
  });

  it('submitPlan 同样解析站点', async () => {
    const submitPlan = vi.fn(async () => ({ one: { ok: true as const, data: 'written' } }));
    const scoped = scopedDataReader(readerOf({ submitPlan }), ['https://a.example.com'], sites);
    const out = await scoped.submitPlan(
      { ...sitePlan, steps: [{ ...sitePlan.steps[0]!, request: { method: 'POST', path: '/x' } }] },
      { idempotencyKey: 'k', confirm: () => true },
    );

    expect(out['one']).toMatchObject({ ok: true });
    expect(submitPlan).toHaveBeenCalledWith(expect.objectContaining({ origin: 'https://a.example.com' }), expect.anything());
  });
});
