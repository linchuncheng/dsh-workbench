import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { RequestRecipe } from '../../../contract/data.js';
import { scriptOf, scriptOfMany } from '../recipe.js';

interface PageResult {
  readonly ok: boolean;
  readonly data?: unknown;
  readonly code?: string;
  readonly message?: string;
  readonly results?: Record<string, { readonly ok: boolean; readonly code?: string; readonly message?: string }>;
}

function recipe(extra: Partial<RequestRecipe> = {}): RequestRecipe {
  return {
    origin: 'https://oa.example.com',
    authLoss: { path: 'errorCode', equals: '002', messagePath: 'msg' },
    request: { method: 'GET', path: '/api/list' },
    ...extra,
  };
}

async function run(
  script: string,
  response: () => Response,
): Promise<PageResult> {
  const sandbox = {
    location: { origin: 'https://oa.example.com' },
    URL,
    Response,
    TextEncoder,
    console,
    fetch: async () => response(),
  };
  return (await runInNewContext(script, sandbox)) as PageResult;
}

describe('配方的登录丢失判定', () => {
  it('200 + 业务码命中 → not-logged-in，消息取 messagePath', async () => {
    const got = await run(
      scriptOf(recipe()),
      () => new Response(JSON.stringify({ errorCode: '002', msg: '登录已过期' }), { status: 200 }),
    );

    expect(got).toEqual({ ok: false, code: 'not-logged-in', message: '登录已过期' });
  });

  it('403 + 业务码命中 → not-logged-in；没有 authLoss 时仍是 forbidden', async () => {
    const body = JSON.stringify({ errorCode: '002', msg: '请重新登录' });
    const withLoss = await run(scriptOf(recipe()), () => new Response(body, { status: 403 }));
    expect(withLoss).toMatchObject({ ok: false, code: 'not-logged-in', message: '请重新登录' });

    const plain = await run(scriptOf({ ...recipe(), authLoss: undefined }), () => new Response(body, { status: 403 }));
    expect(plain).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('未命中不误判，照常取 response.path', async () => {
    const got = await run(
      scriptOf(recipe({ response: { kind: 'json', path: 'data.list' } })),
      () => new Response(JSON.stringify({ errorCode: '000', data: { list: [1, 2] } }), { status: 200 }),
    );

    expect(got).toEqual({ ok: true, data: [1, 2] });
  });

  it('401 无论有没有 authLoss 都算没登录（与计划 / 通道一致）', async () => {
    const got = await run(
      scriptOf({ ...recipe(), authLoss: undefined }),
      () => new Response('', { status: 401 }),
    );
    expect(got).toMatchObject({ ok: false, code: 'not-logged-in' });
  });

  it('403 非 JSON 不误判，仍是 forbidden', async () => {
    const got = await run(scriptOf(recipe()), () => new Response('<html>login</html>', { status: 403 }));
    expect(got).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('in 集合命中同样算登录丢失', async () => {
    const got = await run(
      scriptOf(recipe({ authLoss: { path: 'state', in: ['expired', 'denied'] } })),
      () => new Response(JSON.stringify({ state: 'expired' }), { status: 200 }),
    );
    expect(got).toMatchObject({ ok: false, code: 'not-logged-in' });
  });

  it('requestMany 一格登录丢失只让那一格失败', async () => {
    const script = scriptOfMany(recipe(), { hit: { path: '/api/hit' }, fine: { path: '/api/fine' } });
    const sandbox = {
      location: { origin: 'https://oa.example.com' },
      URL,
      Response,
      TextEncoder,
      console,
      fetch: async (input: string | URL) =>
        String(input).includes('hit')
          ? new Response(JSON.stringify({ errorCode: '002', msg: '登录已过期' }), { status: 200 })
          : new Response(JSON.stringify({ errorCode: '000', data: 1 }), { status: 200 }),
    };
    const out = (await runInNewContext(script, sandbox)) as PageResult;

    expect(out.results?.['hit']).toMatchObject({ ok: false, code: 'not-logged-in' });
    expect(out.results?.['fine']).toMatchObject({ ok: true });
  });
});
