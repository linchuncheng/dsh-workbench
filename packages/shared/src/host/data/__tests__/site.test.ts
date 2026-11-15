import { describe, expect, it } from 'vitest';
import type { RequestPlan, RequestRecipe } from '../../../contract/data.js';
import type { UnitSites } from '../site.js';
import { envelopePathOf, expandPlanPathsOf, resolvePlanOf, resolveRecipeOf } from '../site.js';

const sites: UnitSites = {
  oa: {
    origin: 'https://oa.example.com',
    loginUrl: 'https://oa.example.com/login',
    session: 'oa-read',
    timeoutMs: 10_000,
    authLoss: { path: 'errorCode', equals: '002' },
    envelope: { dataPath: 'data' },
  },
};

const recipe = (extra: Partial<RequestRecipe> = {}): RequestRecipe => ({
  site: 'oa',
  request: { method: 'GET', path: '/api/list' },
  ...extra,
});

const plan = (extra: Partial<RequestPlan> = {}): RequestPlan => ({
  site: 'oa',
  steps: [{ name: 'list', request: { method: 'GET', path: '/api/list' } }],
  ...extra,
});

describe('配方按站点解析', () => {
  it('只写 site：填齐 origin / loginUrl / session / timeout / authLoss', () => {
    const got = resolveRecipeOf(recipe(), sites);

    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.origin).toBe('https://oa.example.com');
    expect(got.value.loginUrl).toBe('https://oa.example.com/login');
    expect(got.value.session).toBe('oa-read');
    expect(got.value.timeoutMs).toBe(10_000);
    expect(got.value.authLoss).toEqual({ path: 'errorCode', equals: '002' });
  });

  it('显式字段覆盖站点默认；origin 同时给时只覆盖 origin', () => {
    const got = resolveRecipeOf(
      recipe({ origin: 'https://x.example.com', timeoutMs: 3_000, loginUrl: 'https://x.example.com/login' }),
      sites,
    );

    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.origin).toBe('https://x.example.com');
    expect(got.value.timeoutMs).toBe(3_000);
    expect(got.value.loginUrl).toBe('https://x.example.com/login');
    expect(got.value.session).toBe('oa-read');
  });

  it('未知站点 / 没有站点表 / 两个都不给都给可读错误', () => {
    expect(resolveRecipeOf(recipe({ site: 'nope' }), sites)).toMatchObject({
      ok: false,
      problem: { pageCode: 'site-undeclared', message: expect.stringContaining('nope') },
    });
    expect(resolveRecipeOf(recipe(), undefined)).toMatchObject({
      ok: false,
      problem: { pageCode: 'site-undeclared', message: expect.stringContaining('没有站点表') },
    });
    expect(resolveRecipeOf({ request: { method: 'GET', path: '/a' } }, sites)).toMatchObject({
      ok: false,
      problem: { code: 'invalid-request' },
    });
  });

  it('原型键不算已声明站点', () => {
    expect(resolveRecipeOf(recipe({ site: 'constructor' }), sites)).toMatchObject({
      ok: false,
      problem: { pageCode: 'site-undeclared' },
    });
    expect(resolveRecipeOf(recipe({ site: '__proto__' }), sites)).toMatchObject({
      ok: false,
      problem: { pageCode: 'site-undeclared' },
    });
  });

  it('非字符串 origin / site 不抛异常，按缺失处理', () => {
    expect(
      resolveRecipeOf({ origin: 5 as never, site: {} as never, request: { method: 'GET', path: '/a' } }, sites),
    ).toMatchObject({ ok: false, problem: { code: 'invalid-request' } });
    expect(resolveRecipeOf(null as never, sites)).toMatchObject({ ok: false, problem: { code: 'invalid-request' } });
    expect(resolveRecipeOf(recipe(), null as never)).toMatchObject({ ok: false, problem: { code: 'invalid-request' } });
    expect(resolveRecipeOf(recipe(), { oa: null } as never)).toMatchObject({ ok: false, problem: { code: 'invalid-request' } });
    expect(resolveRecipeOf(recipe(), { oa: { loginUrl: 'https://oa.example.com/login' } } as never)).toMatchObject({
      ok: false,
      problem: { message: expect.stringContaining('没有 origin') },
    });
  });

  it('已带 origin 的旧配方逐字不变', () => {
    const old = { origin: 'https://x.example.com', request: { method: 'GET' as const, path: '/a' } };
    const got = resolveRecipeOf(old, sites);

    expect(got).toEqual({ ok: true, value: old });
  });
});

describe('计划按站点解析', () => {
  it('只写 site：填 origin 与 authLoss', () => {
    const got = resolvePlanOf(plan(), sites);

    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.origin).toBe('https://oa.example.com');
    expect(got.value.authLoss).toEqual({ path: 'errorCode', equals: '002' });
    expect(got.value.loginUrl).toBe('https://oa.example.com/login');
  });

  it('未知站点回 site-undeclared', () => {
    expect(resolvePlanOf(plan({ site: 'nope' }), sites)).toMatchObject({
      ok: false,
      problem: { pageCode: 'site-undeclared' },
    });
  });
});

describe('信封路径展开', () => {
  it('没有信封 / 显式关闭时原样返回', () => {
    expect(envelopePathOf('list', undefined)).toEqual({ ok: true, path: 'list' });
    expect(envelopePathOf('list', false)).toEqual({ ok: true, path: 'list' });
  });

  it('空路径取 dataPath，相对路径前置，已带前缀保留', () => {
    expect(envelopePathOf(undefined, { dataPath: 'data' })).toEqual({ ok: true, path: 'data' });
    expect(envelopePathOf('list', { dataPath: 'data' })).toEqual({ ok: true, path: 'data.list' });
    expect(envelopePathOf('data.list', { dataPath: 'data' })).toEqual({ ok: true, path: 'data.list' });
  });

  it('重复前缀与多段 dataPath 的相对路径都拒', () => {
    expect(envelopePathOf('data.data', { dataPath: 'data' })).toMatchObject({ ok: false });
    expect(envelopePathOf('list', { dataPath: 'data.list' })).toMatchObject({ ok: false });
    expect(envelopePathOf('data.list.rows', { dataPath: 'data.list' })).toEqual({
      ok: true,
      path: 'data.list.rows',
    });
  });

  it('data.dataList 不是重复前缀', () => {
    expect(envelopePathOf('dataList', { dataPath: 'data' })).toEqual({ ok: true, path: 'data.dataList' });
  });

  it('畸形信封给可读错误，不抛', () => {
    expect(envelopePathOf('list', { dataPath: 5 } as never)).toMatchObject({ ok: false });
    expect(envelopePathOf('list', null as never)).toMatchObject({ ok: false });
    expect(envelopePathOf(5 as never, { dataPath: 'data' })).toMatchObject({ ok: false });
  });

  it('空段路径与空段 dataPath 都拒', () => {
    expect(envelopePathOf('data..list', { dataPath: 'data' })).toMatchObject({ ok: false, problem: expect.stringContaining('空段') });
    expect(envelopePathOf(undefined, { dataPath: 'data.' })).toMatchObject({ ok: false, problem: expect.stringContaining('空段') });
  });
});

describe('手写计划展开', () => {
  it('response.path 与 while.path 都展开', () => {
    const got = expandPlanPathsOf(
      {
        site: 'oa',
        steps: [
          {
            name: 'list',
            request: { method: 'GET', path: '/api/list' },
            response: { path: 'list' },
            while: { path: 'more', equals: false },
          },
        ],
      },
      sites.oa,
    );

    expect(got.steps[0]?.response?.path).toBe('data.list');
    expect(got.steps[0]?.while?.path).toBe('data.more');
  });

  it('信封关闭 / 非 json 响应不展开', () => {
    const closed = expandPlanPathsOf(plan({ steps: [{ name: 'a', request: { method: 'GET', path: '/a' }, response: { path: 'x' } }] }), sites.oa, { envelope: false });
    expect(closed.steps[0]?.response?.path).toBe('x');

    const text = expandPlanPathsOf(
      plan({ steps: [{ name: 'a', request: { method: 'GET', path: '/a' }, response: { kind: 'text', path: 'x' } }] }),
      sites.oa,
    );
    expect(text.steps[0]?.response?.path).toBe('x');
  });

  it('无法展开时抛出可读错误', () => {
    expect(() =>
      expandPlanPathsOf(
        plan({ steps: [{ name: 'a', request: { method: 'GET', path: '/a' }, response: { path: 'x' } }] }),
        { origin: 'https://oa.example.com', envelope: { dataPath: 'data.list' } },
      ),
    ).toThrow(/dataPath 有多段/);
  });

  it('容忍 null step / response / while', () => {
    const plan0 = {
      site: 'oa',
      steps: [
        { name: 'a', request: { method: 'GET', path: '/a' }, response: null, while: null },
        { name: 'b', request: { method: 'GET', path: '/b' } },
      ],
    } as never;
    const got = expandPlanPathsOf(plan0, sites.oa);

    expect(got.steps[0]?.response).toBeUndefined();
    expect(got.steps[0]?.while).toBeUndefined();
    expect(() => expandPlanPathsOf({ site: 'oa', steps: [null] } as never, sites.oa)).toThrow(/步骤要是对象/);
  });
});
