import { describe, expect, it, vi } from 'vitest';
import { RECORD_ARM_SCRIPT, RECORD_KEEP_KEY } from '../diy-record-scripts';
import { FakeEl, buttonOf, flush, makeHarness, readPage, runScript } from '../../__tests__/record-page-harness';

describe('请求发出的那一刻先记账（页面一跳走也不丢入参）', () => {
  it('★★★ 假 fetch 永不 resolve：发送那一刻就已经有一条（方法 / URL / 入参全在，status 0）', async () => {
    const harness = makeHarness();
    harness.win.fetch = () => new Promise<never>(() => {});
    runScript(RECORD_ARM_SCRIPT, harness);
    void harness.win.fetch('/api/publish', { method: 'POST', body: '{"title":"发布 v1.2"}' });
    await flush();

    const calls = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: '/api/publish',
      body: '{"title":"发布 v1.2"}',
      status: 0,
      ct: '',
      response: '',
    });
    expect(harness.storage.raw(RECORD_KEEP_KEY)?.['calls']).toEqual(calls);
  });

  it('★★ 回包回来补全的是同一条（不新增行）', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    await harness.win.fetch('/api/publish', { method: 'POST', body: '{"title":"发布 v1.2"}' });
    await flush();

    const calls = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.['status']).toBe(200);
    expect(calls[0]?.['ct']).toBe('application/json');
    expect(calls[0]?.['response']).toBe('{"ok":true}');
    expect(calls[0]?.['body']).toBe('{"title":"发布 v1.2"}');
  });

  it('★ XHR：send 那一刻先记，loadend 补全同一条', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);

    const xhr = new harness.XMLHttpRequest();
    xhr.open('POST', '/api/publish');
    xhr.send('{"title":"x"}');
    const sent = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ method: 'POST', url: '/api/publish', body: '{"title":"x"}', status: 0, response: '' });

    xhr.status = 201;
    xhr.responseText = '{"ok":true}';
    xhr.fire('loadend');
    const done = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(done).toHaveLength(1);
    expect(done[0]?.['status']).toBe(201);
    expect(done[0]?.['response']).toBe('{"ok":true}');
  });

  it('★ 失败的 fetch 也只在发出那一刻记一条，回包那一拍补上状态', async () => {
    const harness = makeHarness();
    harness.win.fetch = () => Promise.reject(new Error('net down'));
    runScript(RECORD_ARM_SCRIPT, harness);
    await harness.win.fetch('/api/publish', { method: 'POST', body: '{"a":1}' }).catch(() => undefined);
    await flush();

    const calls = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.['status']).toBe(0);
    expect(calls[0]?.['ct']).toBe('fetch-error');
    expect(calls[0]?.['body']).toBe('{"a":1}');
  });

  it('★ sendBeacon 只记一条（它本来就没有回包）', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    harness.navigator.sendBeacon?.('/api/beacon', '{"a":1}');
    await flush();

    const calls = (await readPage(harness))['calls'] as Array<Record<string, unknown>>;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/beacon', body: '{"a":1}', status: 0, ct: '', response: '' });
  });
});

describe('页面自己叫醒宿主：没有网络请求、没有计数台账，只有「有事了」这一下', () => {
  const armed = (): ReturnType<typeof makeHarness> => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    return harness;
  };
  const winOf = (harness: ReturnType<typeof makeHarness>): Record<string, unknown> =>
    harness.win as unknown as Record<string, unknown>;

  it('★★ 他按结束、按截图，都叫醒一次（宿主那条 eval 才能立刻回来）', async () => {
    const harness = armed();
    const win = winOf(harness);
    let woke = 0;
    win['__dshRecordWake'] = () => {
      woke += 1;
    };

    buttonOf(harness, '拍一张当前页面的截图').onclick?.();
    expect(woke).toBe(1);
    expect(win['__dshRecordWake']).toBeNull();

    win['__dshRecordWake'] = () => {
      woke += 1;
    };
    const end = buttonOf(harness, '结束录制');
    (end.onclick as (event: { detail: number }) => void)({ detail: 1 });
    expect(woke).toBe(2);
  });

  it('★★ 一条 XHR 都不发（叫醒只靠页面内的一个函数，不走网络）', async () => {
    const harness = armed();
    const end = buttonOf(harness, '结束录制');
    (end.onclick as (event: { detail: number }) => void)({ detail: 1 });
    (end.onclick as (event: { detail: number }) => void)({ detail: 1 });
    await readPage(harness);

    expect(harness.xhrs).toEqual([]);
  });

  it('★★ 读那一拍就等在唤醒上：他按结束，那一拍立刻带着 finished 回来', async () => {
    const harness = armed();
    const pending = readPage(harness);
    const end = buttonOf(harness, '结束录制');
    (end.onclick as (event: { detail: number }) => void)({ detail: 1 });
    (end.onclick as (event: { detail: number }) => void)({ detail: 1 });
    const woken = await pending;

    expect(woken['phase']).toBe('finished');
    expect(woken['beat']).toBeUndefined();
    expect(woken['beatKind']).toBeUndefined();
  });

  it('★★ 等满 3 秒没人动 ⇒ 照原样回来（不抛、不带 beat 字段）', async () => {
    vi.useFakeTimers();
    try {
      const harness = armed();
      const pending = readPage(harness);
      await vi.advanceTimersByTimeAsync(3000);
      const late = await pending;
      expect(late['phase']).toBe('recording');
      expect(late['beat']).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('★ 页面上没有 ARM 状态（刚导航过）⇒ 立刻 return，不干等、不抛', async () => {
    const read = await readPage(makeHarness());
    expect(read['ok']).toBe(false);
    expect(read['phase']).toBe('none');
  });
});

describe('写请求出门那一刻连表单一起抓：页面跳走了也不丢必填信息', () => {
  const formOf = (harness: ReturnType<typeof makeHarness>): FakeEl => {
    const form = new FakeEl('form');
    const item = new FakeEl('div');
    item.className = 'ant-form-item ant-form-item-required';
    const label = new FakeEl('label');
    label.textContent = '标题 *';
    const input = new FakeEl('input');
    input.setAttribute('name', 'title');
    input.setAttribute('aria-required', 'true');
    input.value = '发布 v1.2';
    const plain = new FakeEl('input');
    plain.setAttribute('name', 'note');
    item.appendChild(label);
    item.appendChild(input);
    form.appendChild(item);
    form.appendChild(plain);
    harness.doc.body.appendChild(form);
    return form;
  };

  it('★★★ 发写请求时抓下原始 HTML + 字段清单（名字 / 必填 / 取值都在）', async () => {
    const harness = makeHarness();
    formOf(harness);
    runScript(RECORD_ARM_SCRIPT, harness);
    await harness.win.fetch('/api/issue/save', { method: 'POST', body: '{"title":"发布 v1.2"}' });
    await flush();

    const snap = harness.storage.raw(RECORD_KEEP_KEY)?.['snap'] as Record<string, unknown>;
    expect(snap['href']).toContain('inventory.example.com');
    expect(String(snap['html'])).toContain('name="title"');
    const fields = snap['fields'] as Array<Record<string, unknown>>;
    expect(fields.map((one) => one['name'])).toEqual(['title', 'note']);
    expect(fields[0]).toMatchObject({ required: true, filled: true, value: '发布 v1.2', label: '标题 *' });
    expect(fields[1]).toMatchObject({ required: false, filled: false });
  });

  it('★★ 读请求不抓（看列表时别把筛选框当成要填的表单）', async () => {
    const harness = makeHarness();
    formOf(harness);
    runScript(RECORD_ARM_SCRIPT, harness);
    await harness.win.fetch('/api/issue/list?page=1');
    await flush();

    expect(harness.storage.raw(RECORD_KEEP_KEY)?.['snap']).toBeUndefined();
    expect(harness.storage.raw(RECORD_KEEP_KEY)?.['snapPages']).toBeUndefined();
  });

  it('★★ 同一页只留最新一份，换页各留一份（最多三份）', async () => {
    const harness = makeHarness();
    formOf(harness);
    runScript(RECORD_ARM_SCRIPT, harness);
    await harness.win.fetch('/api/issue/save', { method: 'POST', body: '{"a":1}' });
    await harness.win.fetch('/api/issue/save', { method: 'POST', body: '{"a":2}' });
    await flush();

    const pages = harness.storage.raw(RECORD_KEEP_KEY)?.['snapPages'] as Array<Record<string, unknown>>;
    expect(pages).toHaveLength(1);
  });
});
