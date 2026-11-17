import { describe, expect, it } from 'vitest';
import { opencliBrowserCaptureOf, opencliErrorOf, opencliResultOf } from '../opencli-wire';

const url = 'https://shop.example.com/api/list';

describe('opencli 的输出只有这一层认：1.x 裸值、2.x 信封、错误块', () => {
  it('★★ 1.x 给裸值就原样交；2.x 的 data 是对象 / 是 JSON 字符串都拆开', () => {
    expect(opencliResultOf(JSON.stringify([{ name: 'argocd' }]))).toEqual([{ name: 'argocd' }]);
    expect(opencliResultOf(JSON.stringify({ ok: true, data: { total: 3 } }))).toEqual({ total: 3 });
    expect(opencliResultOf(JSON.stringify({ ok: true, data: JSON.stringify({ href: 'u' }) }))).toEqual({ href: 'u' });
    expect(opencliResultOf('noise')).toBeUndefined();
  });

  it('★★ 失败时把 error 抬出来（外壳只看得到 error 这一格）', () => {
    expect(opencliResultOf(JSON.stringify({ ok: false, error: { code: 'session_busy', message: '忙' } }))).toEqual({
      code: 'session_busy',
      message: '忙',
    });
    expect(opencliResultOf(JSON.stringify({ ok: false, code: 'stale', message: '旧了' }))).toEqual({
      ok: false,
      code: 'stale',
      message: '旧了',
    });
  });

  it('★★ 错误信封：2.x 的 JSON 与 1.x 那种 JSON 错误对象都认，没有就交给调用方回落', () => {
    expect(
      opencliErrorOf(JSON.stringify({ ok: false, error: { code: 'AUTH_REQUIRED', message: '要登录', hint: '先登录' } })),
    ).toEqual({ code: 'AUTH_REQUIRED', message: '要登录', help: '先登录' });
    expect(opencliErrorOf(JSON.stringify({ code: 'not-logged-in', message: '没登录' }))).toEqual({
      code: 'not-logged-in',
      message: '没登录',
    });
    expect(opencliErrorOf('不只是 JSON')).toBeUndefined();
  });

  it('★★ 2.x 的额外字段别丢：candidates / available_keys / exitCode 都要带出来给 agent', () => {
    const envelope = opencliErrorOf(
      JSON.stringify({
        ok: false,
        error: {
          code: 'BROWSER_TARGET_AMBIGUOUS',
          message: '有 2 个标签页对得上',
          hint: '换一个 target 再试',
          candidates: [{ id: 1, title: '收件箱' }, { id: 2, title: '草稿' }],
          matches_n: 2,
          exitCode: 69,
        },
      }),
    );

    expect(envelope).toMatchObject({
      code: 'BROWSER_TARGET_AMBIGUOUS',
      message: '有 2 个标签页对得上',
      help: '换一个 target 再试',
      exitCode: 69,
    });
    expect(envelope?.detail).toContain('candidates');
    expect(envelope?.detail).toContain('收件箱');
    expect(envelope?.detail).toContain('matches_n');
  });

  it('★★ 没额外字段就不硬塞 detail（1.x 的文本错误也不该多一格）', () => {
    expect(opencliErrorOf(JSON.stringify({ ok: false, error: { code: 'E', message: 'M' } }))).toEqual({
      code: 'E',
      message: 'M',
    });
  });
});

describe('会话捕获的行：2.x 信封 / 我们自己归一后的行 / 坏行', () => {
  const entry = {
    key: 'POST /api/list',
    url,
    method: 'post',
    status: 200,
    ct: 'application/json',
    size: 12,
    timestamp: '2026-11-17T11:58:57.964Z',
    request: { body: { page: 1 }, headers: { 'x-a': '1' }, body_full_size: 18 },
    body: { ok: true },
    body_full_size: 11,
  };

  it('★★ 2.x 的信封行：拆开、按 entries 摊平、时间取条目自己的 timestamp', () => {
    const text = JSON.stringify({ ok: true, data: { captured_at: '2026-11-17T11:58:58.000Z', count: 1, entries: [entry] } });
    const rows = opencliBrowserCaptureOf(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'POST /api/list',
      method: 'POST',
      url,
      status: 200,
      at: Date.parse('2026-11-17T11:58:57.964Z'),
      request: '{"page":1}',
      response: '{"ok":true}',
      requestFullSize: 18,
      responseFullSize: 11,
      requestSizeExact: true,
      responseSizeExact: true,
    });
    expect(rows[0]?.headers).toContain('x-a');
  });

  it('★★ 条目没自带时间时用这一行的 captured_at 兜（不然段窗口筛不对）', () => {
    const bare = { ...entry, timestamp: undefined };
    const text = JSON.stringify({ ok: true, data: { captured_at: '2026-11-17T11:58:59.000Z', entries: [bare] } });
    expect(opencliBrowserCaptureOf(text)[0]?.at).toBe(Date.parse('2026-11-17T11:58:59.000Z'));
  });

  it('★★ 已经归一过的行原样认（我们落盘存的就是这种）；坏行跳过', () => {
    const own = {
      key: '',
      at: 1794916736691,
      method: 'POST',
      url,
      status: 200,
      ct: 'application/json',
      size: 3,
      request: '{"a":1}',
      response: '{"ok":true}',
      requestFullSize: 7,
      responseFullSize: 11,
      requestSizeExact: true,
      responseSizeExact: true,
      headers: '',
    };
    const text = ['不是 JSON', '', JSON.stringify(own), JSON.stringify({ entries: [{ nope: 1 }] })].join('\n');
    const rows = opencliBrowserCaptureOf(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ at: own.at, url, request: '{"a":1}' });
  });
});
