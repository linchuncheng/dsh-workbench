import { describe, expect, it } from 'vitest';
import { createSeam, type DshShell } from '@dsh-workbench/shared/host';
import { createDataReader } from '../index.js';

type Dialect = 'flag' | 'positional';

function readerOf(dialect: Dialect | (() => Dialect) = 'flag') {
  const lines: string[] = [];
  const shell = {
    resolve(request: { command?: string; argv?: readonly string[]; signal?: AbortSignal }) {
      lines.push(request.argv === undefined ? (request.command ?? '') : request.argv.join(' '));
      return request;
    },
    async execute() {
      return {
        async result() {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return {
            exitCode: 0,
            timedOut: false,
            aborted: false,
            stdout: { text: JSON.stringify({ ok: true, data: { ok: true, data: 1 } }), truncated: false },
            stderr: { text: '', truncated: false },
          };
        },
      };
    },
  } as unknown as DshShell;
  return {
    reader: createDataReader({
      seam: createSeam({ shell, runtimeRoot: '/tmp/wb-write-session' }),
      channel: false,
      dialectOf: typeof dialect === 'function' ? dialect : () => dialect,
    }),
    lines,
  };
}

function recipeOf(method: 'GET' | 'POST') {
  return {
    origin: 'https://same.example.com',
    authLoss: { path: 'errorCode' as const, equals: '002', messagePath: 'msg' },
    request: { method, path: '/api/x', kind: 'browser' as const, script: 'location.href' },
  };
}

const closes = (lines: readonly string[]) =>
  lines.filter((line) => /['"\s]close['"]?\s*$/.test(line)).length;

describe('写会话是用完就关，读会话留着复用', () => {
  it('★ 同站点连写三次 → 三次各自关（不把写用的标签留在浏览器里）', async () => {
    const { reader, lines } = readerOf();
    await reader.submit(recipeOf('POST'));
    await reader.submit(recipeOf('POST'));
    await reader.submit(recipeOf('POST'));

    expect(closes(lines)).toBe(3);
  });

  it('★ 同站点并发三次写 → 只关一次（等同批都跑完）', async () => {
    const { reader, lines } = readerOf();
    await Promise.all([
      reader.submit(recipeOf('POST')),
      reader.submit(recipeOf('POST')),
      reader.submit(recipeOf('POST')),
    ]);

    expect(closes(lines)).toBe(1);
  });

  it('★ 方言每条命令现算：中途换了运行时，下一条命令跟着换', async () => {
    let current: Dialect = 'positional';
    const { reader, lines } = readerOf(() => current);
    await reader.submit(recipeOf('POST'));

    expect(lines.filter((line) => line.includes('--session'))).toHaveLength(0);

    current = 'flag';
    await reader.submit(recipeOf('POST'));

    expect(lines.some((line) => line.includes('--session'))).toBe(true);
  });

  it('★ 1.x 的关窗也按位置参数发（不带 --session）', async () => {
    const { reader, lines } = readerOf('positional');
    await reader.submit(recipeOf('POST'));

    const closeLine = lines.find((line) => /close['"]?\s*$/.test(line)) ?? '';
    expect(closeLine).toContain('browser');
    expect(closeLine).not.toContain('--session');
    expect(closes(lines)).toBe(1);
  });

  it('★ 读不关：读的标签留着，下次接着用', async () => {
    const { reader, lines } = readerOf();
    await reader.request(recipeOf('GET'));
    await reader.request(recipeOf('GET'));

    expect(closes(lines)).toBe(0);
  });

  it('★ 写与读各用各的会话名：写关了，读那个还在', async () => {
    const { reader, lines } = readerOf();
    await reader.request(recipeOf('GET'));
    await reader.submit(recipeOf('POST'));

    const sessions = lines.map((line) => /--session['"\s]+'?([^'"\s]+)/.exec(line)?.[1] ?? '');
    expect(sessions.some((one) => one.includes('-write'))).toBe(true);
    expect(sessions.some((one) => one === 'workbench-read-same-example-com')).toBe(true);
    expect(closes(lines)).toBe(1);
  });
});
