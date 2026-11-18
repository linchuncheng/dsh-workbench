import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEGMENT_SLACK_MS,
  captureCallsOf,
  captureEntriesOf,
  captureLineOf,
  mergeCalls,
  pickAllOf,
  pickOf,
  segmentOf,
} from '../diy-record-capture';
import { createDiyRig } from '../../__tests__/diy-harness';
import { captureRowsOf } from '../../__tests__/test-adapters';
import { ARM_OK, GET, POST, URL, call, entry, envelope, heldStore, line } from '../../__tests__/record-fixtures';
import { DIY_RECORD_READ_TOOL, DIY_RECORD_STOP_TOOL } from '../../unit';
import type { RecordCall, RecordListRow } from '../diy-record-text';

const capture = (text: string) => captureEntriesOf(text, captureRowsOf);

const T0 = dayjs('2026-10-20T03:00:00.000Z').valueOf();
const T1 = T0 + 10_000;

describe('会话捕获那份 JSONL：只认解析得出 url + method 的行', () => {
  it('★★ 2.x 的捕获行外面裹了一层 { ok, data }：拆开照样按 entries 逐条读，时间取那一行的 captured_at', () => {
    const stamped = JSON.parse(line('POST', `${URL}/api/publish`, T0 + 5000));
    const bare: Record<string, unknown> = { ...stamped };
    delete bare['timestamp'];
    const inner = JSON.parse(envelope([stamped, bare]));
    const text = JSON.stringify({
      ok: true,
      data: { ...inner, captured_at: '2026-10-20T03:00:06.000Z' },
    });

    const entries = capture(text);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ method: 'POST', url: `${URL}/api/publish`, at: T0 + 5000 });
    expect(entries[1]?.at).toBe(T0 + 6000);
    expect(segmentOf(entries, T0 + 5000, T0 + 7000).inside).toHaveLength(2);
  });

  it('★ 坏行 / error 行 / 空行 / 非对象行全部跳过，合法行逐格取', () => {
    const text = [
      '',
      '   ',
      'not json at all',
      '{"error":{"code":"ECONNREFUSED","message":"连不上"}}',
      '[1,2,3]',
      '"就是一句话"',
      '{"method":"POST","timestamp":"2026-10-20T03:00:05.000Z"}',
      '{"url":"https://x.example.com/y"}',
      line('POST', `${URL}/api/publish`, T0 + 5000, { status: 201, ct: 'application/json', size: 42, key: 'k1' }),
    ].join('\n');

    const entries = capture(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'k1',
      at: T0 + 5000,
      method: 'POST',
      url: `${URL}/api/publish`,
      status: 201,
      ct: 'application/json',
      size: 42,
    });
  });

  it('★ 时间戳解析不出就给 0；缺格给缺省；方法统一大写（好跟钩子那份对键）', () => {
    const entries = capture(
      [
        '{"url":"https://x.example.com/a","method":"post","timestamp":"不是时间"}',
        '{"url":"https://x.example.com/b","method":"get"}',
      ].join('\n'),
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]?.at).toBe(0);
    expect(entries[0]?.method).toBe('POST');
    expect(entries[0]?.status).toBe(0);
    expect(entries[0]?.ct).toBe('');
    expect(entries[0]?.size).toBe(0);
    expect(entries[0]?.key).toBe('');
    expect(entries[1]?.at).toBe(0);
    expect(entries[1]?.method).toBe('GET');
  });

  it('★ 空文本 / 整份都是坏行 ⇒ 一条都没有（不抛）', () => {
    expect(capture('')).toEqual([]);
    expect(capture('\n\n不是什么 json\n')).toEqual([]);
  });
});

describe('钩子那份也能落成一行捕获：写下去、读回来还是同一批', () => {
  it('★★ 方法 / URL / 入参 / 回包 / 时间都不丢（tab 关掉之后还能从捕获文件里翻出来）', () => {
    const at = T0 + 4321;
    const calls: RecordCall[] = [
      {
        key: '',
        method: 'POST',
        url: `${URL}/api/publish`,
        body: '{"title":"v1"}',
        status: 201,
        ct: 'application/json',
        response: '{"ok":true}',
        at,
        source: 'hook',
      },
    ];

    const entries = capture(captureLineOf(calls));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: 'POST',
      url: `${URL}/api/publish`,
      status: 201,
      ct: 'application/json',
      request: '{"title":"v1"}',
      response: '{"ok":true}',
      at,
    });
    expect(captureLineOf([])).toBe('');
  });
});

describe('段窗口：t0/t1 都在时按 [t0 - slack, t1 + slack] 筛', () => {
  const at = (offset: number) => capture(line('POST', `${URL}/api/x`, T0 + offset));

  it('★ 窗口两端各留 slack：结束之后十几毫秒才落行的回包也算在里面', () => {
    const entries = [
      ...capture(line('GET', `${URL}/before`, T0 - SEGMENT_SLACK_MS - 1)),
      ...capture(line('GET', `${URL}/edge-before`, T0 - SEGMENT_SLACK_MS)),
      ...at(0),
      ...at(5000),
      ...capture(line('POST', `${URL}/edge-after`, T1 + SEGMENT_SLACK_MS)),
      ...capture(line('GET', `${URL}/after`, T1 + SEGMENT_SLACK_MS + 1)),
    ];

    const segment = segmentOf(entries, T0, T1);

    expect(segment.inside.map((one) => one.url)).toEqual([
      `${URL}/edge-before`,
      `${URL}/api/x`,
      `${URL}/api/x`,
      `${URL}/edge-after`,
    ]);
    expect(segment.outside).toBe(2);
  });

  it('★ t0/t1 缺一个就不筛：全部算 inside、outside 是 0', () => {
    const entries = [
      ...capture(line('GET', `${URL}/a`, T0 - 60_000)),
      ...capture(line('POST', `${URL}/b`, T1 + 60_000)),
    ];

    expect(segmentOf(entries, null, T1).inside).toHaveLength(2);
    expect(segmentOf(entries, null, T1).outside).toBe(0);
    expect(segmentOf(entries, T0, null).inside).toHaveLength(2);
    expect(segmentOf(entries, null, null).inside).toHaveLength(2);
    expect(segmentOf([], T0, T1)).toEqual({ inside: [], outside: 0 });
  });

  it('★ 时间戳读不出的行（at = 0）不算"段外"：宁可留着当证据，也不静默丢', () => {
    const entries = capture('{"url":"https://x.example.com/a","method":"POST","timestamp":"坏的"}');

    const segment = segmentOf(entries, T0, T1);

    expect(segment.inside).toHaveLength(1);
    expect(segment.outside).toBe(0);
  });

  it('★ 当 at 的条目原样留下（不动 entries 本身）', () => {
    const entries = [...at(-99999), ...at(0)];
    const segment = segmentOf(entries, T0, T1);

    expect(entries).toHaveLength(2);
    expect(segment.inside).toHaveLength(1);
    expect(segment.outside).toBe(1);
  });
});

describe('捕获行 → RecordCall：没有 body 就如实空着', () => {
  it('★ source 是 capture、body/response 是空串、at 是行时间', () => {
    const entries = capture(line('POST', `${URL}/api/publish`, T0 + 7, { status: 500, ct: 'text/plain' }));

    expect(captureCallsOf(entries)).toEqual([
      {
        key: `POST ${URL}/api/publish`,
        method: 'POST',
        url: `${URL}/api/publish`,
        body: '',
        status: 500,
        ct: 'text/plain',
        response: '',
        at: T0 + 7,
        source: 'capture',
      },
    ]);
    expect(captureCallsOf([])).toEqual([]);
  });
});

describe('一轮一次调用的「信封行」：形状 + 体（入参 / 出参）都在一行里', () => {
  it('★★ 信封行（{entries:[…]}）要被摊平；request.body 与 body 各归各位', () => {
    const text = envelope([
      entry('POST', `${URL}/api/publish`, T0 + 5, {
        request: { headers: { 'content-type': 'application/json' }, body: { env: 'test' }, body_full_size: 14 },
        body: { ok: true },
        body_full_size: 11,
      }),
      entry('GET', `${URL}/api/list`, T0 + 6),
    ]);

    const entries = capture(text);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.key).toBe(`POST ${URL}/api/publish`);
    expect(entries[0]?.request).toBe('{"env":"test"}');
    expect(entries[0]?.response).toBe('{"ok":true}');
    expect(entries[0]?.requestFullSize).toBe(14);
    expect(entries[0]?.responseFullSize).toBe(11);
    expect(entries[0]?.headers).toContain('content-type');
    expect(entries[1]?.request).toBe('');
    expect(entries[1]?.response).toBe('');
  });

  it('★★ 两种行混在一份文件里也认（老的逐条行 + 新的信封行）', () => {
    const text = [line('GET', `${URL}/api/old`, T0 + 1), envelope([entry('POST', `${URL}/api/new`, T0 + 2)])].join('\n');

    const entries = capture(text);
    expect(entries.map((one) => one.url)).toEqual([`${URL}/api/old`, `${URL}/api/new`]);
  });

  it('★★ 同一 key + 同一时间戳只算一条（轮询/重试导致的重复不算两次）', () => {
    const one = entry('POST', `${URL}/api/publish`, T0 + 5);
    const text = [envelope([one]), envelope([one])].join('\n');

    expect(capture(text)).toHaveLength(1);
  });

  it('★★ pickOf：精确 key 优先，退到去 #N 后缀，再退到 `method url`', () => {
    const entries = capture(
      envelope([
        entry('POST', `${URL}/api/publish`, T0 + 5),
        entry('POST', `${URL}/api/publish`, T0 + 6, { key: `POST ${URL}/api/publish#2` }),
      ]),
    );

    expect(pickOf(entries, `POST ${URL}/api/publish#2`)?.at).toBe(T0 + 6);
    expect(pickOf(entries, `POST ${URL}/api/publish#9`)?.at).toBe(T0 + 5);
    expect(pickOf(entries, `POST ${URL}/api/publish`)?.at).toBe(T0 + 5);
    expect(pickOf(entries, 'NOPE nope')).toBeNull();
    expect(pickOf(entries, '  ')).toBeNull();
  });

  it('★★ 同一个 key 跨轮重名（opencli 的计数器每批重置）：给 at 才钉得住是哪一次', () => {
    const entries = capture(
      envelope([
        entry('POST', `${URL}/api/save`, T0 + 5, { request: { body: '{"id":1}' } }),
        entry('POST', `${URL}/api/save`, T0 + 9, { request: { body: '{"id":2}' } }),
      ]),
    );

    expect(pickAllOf(entries, `POST ${URL}/api/save`)).toHaveLength(2);
    expect(pickOf(entries, `POST ${URL}/api/save`)?.request).toBe('{"id":1}');
    expect(pickOf(entries, `POST ${URL}/api/save`, T0 + 9)?.request).toBe('{"id":2}');
  });

  it('★★ 在飞的请求每一轮都被重吐一遍：同一个 key@at 取信息最全的那份（后到的回包不许丢）', () => {
    const flying = envelope([entry('POST', `${URL}/api/save`, T0 + 5, { status: 0, request: { body: '{"id":1}' } })]);
    const landed = envelope([
      entry('POST', `${URL}/api/save`, T0 + 5, {
        status: 200,
        ct: 'application/json',
        body: { ok: true },
        request: { body: '{"id":1}' },
      }),
    ]);

    const entries = capture([flying, flying, landed, landed].join('\n'));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe(200);
    expect(entries[0]?.response).toBe('{"ok":true}');
    expect(entries[0]?.request).toBe('{"id":1}');
  });
});

describe('合并两份来源：按 method + url 去重，钩子那份优先', () => {
  it('★ 同一条两边都有 ⇒ 留钩子那条（它有 body），捕获那条补上 key 之后不算两条', () => {
    const hook = [POST()];
    const captured = captureCallsOf(capture(line('POST', `${URL}/api/publish`, T0 + 3)));

    const merged = mergeCalls(hook, captured);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.body).toBe('{"env":"test"}');
    expect(merged[0]?.source).toBe('hook');
    expect(merged[0]?.key).toBe(`POST ${URL}/api/publish`);
  });

  it('★★ 钩子记的是无协议地址（host:port/…）也认出来：同一次保存不该列两条', () => {
    const hook = [{ ...call('POST', `${URL}/api/issue/save`, '', 'hook'), at: T0 + 1 }];
    const captured = captureCallsOf(capture(line('POST', `${URL}/api/issue/save`, T0 + 2))).map((one) => ({
      ...one,
      url: one.url.replace(/^http:\/\//u, ''),
    }));

    const merged = mergeCalls(hook, captured);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe('hook');
  });

  it('★ 只有捕获有的那条留下（source = capture），结果按 at 升序', () => {
    const hook = [call('GET', `${URL}/api/list`, '', 'hook')].map((one) => ({ ...one, at: T0 + 30 }));
    const captured = captureCallsOf(
      capture(
        [line('POST', `${URL}/api/publish`, T0 + 10), line('DELETE', `${URL}/api/x`, T0 + 50)].join('\n'),
      ),
    );

    const merged = mergeCalls(hook, captured);

    expect(merged.map((one) => one.url)).toEqual([
      `${URL}/api/publish`,
      `${URL}/api/list`,
      `${URL}/api/x`,
    ]);
    expect(merged.map((one) => one.source)).toEqual(['capture', 'hook', 'capture']);
    expect(hook).toHaveLength(1);
  });

  it('★★ 钩子那份原样留着（两条同名也算两次真调用）；**捕获两条同名也是两次真调用**（只在钩子那几条上配对）', () => {
    const hook: RecordCall[] = [POST(), { ...POST(), at: 2 }];
    const captured = captureCallsOf(
      capture([
        line('POST', `${URL}/api/publish`, T0 + 1, { body: '{"id":1}' }),
        line('POST', `${URL}/api/publish`, T0 + 2, { body: '{"id":2}' }),
      ].join('\n')),
    );

    expect(mergeCalls(hook, captured)).toHaveLength(2);
    const only = mergeCalls([], captured);
    expect(only).toHaveLength(2);
    expect(only.map((one) => one.response)).toEqual(['{"id":1}', '{"id":2}']);
  });

  it('★ 两边都空 ⇒ 空数组', () => {
    expect(mergeCalls([], [])).toEqual([]);
    expect(mergeCalls([GET()], [])).toEqual([GET()]);
  });
});

const writeCapture = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
};

describe('捕获这条来源接进 read / stop（真工具 + shell 桩）', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
  });

  it('★★ read：两个来源都是 0 才说没抓到（钩子 / 捕获两个 0 都写出来）', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      record: heldStore(null),
      probe: [
        { stdout: ARM_OK({ phase: 'finished' }) },
        { stdout: JSON.stringify({ ok: true, phase: 'finished', t0: 1, t1: 2, calls: [] }) },
      ],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as {
      captureLines: number;
      noBody: boolean;
      text: string;
    };

    expect(out.captureLines).toBe(0);
    expect(out.noBody).toBe(false);
    expect(out.text).toContain('一条请求都没抓到');
    expect(out.text).toContain('页面钩子 0 条');
    expect(out.text).toContain('落在这个时间段里 0 条');
  });

  it('★★ 捕获被 tail 截过（行数超过上限）：read 要如实把这件事带出来，不许装作"一行都没落"', async () => {
    const capture = join(rig.root(), 'workbench', 'artifacts', 'rec-demo.jsonl');
    writeCapture(
      capture,
      Array.from({ length: 20001 }, (_, i) => line('GET', `${URL}/api/n${String(i)}`, 5)).join('\n') + '\n',
    );
    const built = rig.harness({
      withTools: true,
      pact: false,
      record: heldStore(null, capture),
      probe: [
        { stdout: ARM_OK({ phase: 'finished' }) },
        { stdout: JSON.stringify({ ok: true, phase: 'finished', t0: 1, t1: 2, href: URL, here: URL, dropped: 0, calls: [] }) },
      ],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as {
      capturedTruncated: boolean;
      capturedTotalLines: number;
      text: string;
    };

    expect(out.capturedTruncated).toBe(true);
    expect(out.capturedTotalLines).toBe(20001);
    expect(out.text).toContain('一共落了 20001 行');
    expect(out.text).toContain('只解析了最后 20000 行');
    expect(out.text).not.toContain('一行都没落');
  });

  it('★★ stop 也认捕获那一条：钩子没看见的写照样进清单（收工前先读一次捕获文件）', async () => {
    const capture = join(rig.root(), 'workbench', 'artifacts', 'rec-demo.jsonl');
    writeCapture(capture, [line('POST', `${URL}/api/publish`, 7), line('GET', `${URL}/api/list`, 8)].join('\n') + '\n');
    const built = rig.harness({
      withTools: true,
      pact: false,
      record: heldStore({ method: 'POST', urlContains: '/api/publish' }, capture),
      probe: [
        { stdout: ARM_OK({ phase: 'finished' }) },
        { stdout: JSON.stringify({ ok: true, unhooked: 1, phase: 'finished', t0: 5, t1: 9, calls: [] }) },
        { stdout: JSON.stringify([{ page: 'p1', url: URL, title: '环境' }]) },
        { stdout: '{"closed":"p1"}' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_STOP_TOOL).execute({ force: true, forceWhy: '夹具里没有表单快照' }, rig.diyExec())) as {
      probeCommand: string;
      rows: readonly RecordListRow[];
      lastFile: string;
      noBody: boolean;
      text: string;
    };

    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]?.source).toBe('capture');
    expect(out.noBody).toBe(true);
    expect(out.probeCommand).toBe('');
    expect(out.lastFile.endsWith('.last')).toBe(true);
    expect(out.text).toContain('该段共 2 条请求（页面钩子已随窗口关闭，条数读不到了；会话捕获该段 2 条）');
    expect(out.text).toContain('只有方法 / URL，无法获取 body');
    expect(out.text).toContain('先征得用户同意');
  });
});

describe('两个来源说的是同一笔写', () => {
  it('★★ 钩子给相对路径、捕获给绝对地址：算一笔，不报成两条', () => {
    const hook = [{ ...POST(), url: '/env/api/publish', at: 1000 }];
    const captured = [{ ...POST(), url: `${URL}/api/publish`, key: 'POST /env/api/publish', at: 1000 }];

    const merged = mergeCalls(hook, captured);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.body).toContain('test');
    expect(merged[0]?.key).toBe('POST /env/api/publish');
  });
});
