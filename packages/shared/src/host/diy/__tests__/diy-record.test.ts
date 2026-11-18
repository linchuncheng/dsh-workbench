import { describe, expect, it } from 'vitest';
import {
  RECORD_STALE_MS,
  createRecordStore,
  parseRecordIntent,
  recordOwnerText,
  type RecordPact,
  type RecordState,
} from '../diy-record.js';

const pact = (sessionId: string, now = 1000, unit = 'demo'): RecordPact => ({
  sessionId,
  workspace: '/w/diy',
  unit,
  name: unit,
  url: 'https://inventory.example.com/env',
  title: '环境 · Inventory',
  action: '发布',
  expect: { method: 'POST', urlContains: '/api/publish' },
  captureFile: '/w/diy/shots/rec-demo.jsonl',
  now,
});

const held = (move: { ok: true; state: RecordState } | { ok: false; code: string }): RecordState => {
  if (!move.ok) throw new Error(`expected ok, got ${move.code}`);
  return move.state;
};

describe('录制交接：一台机器一次一场，谁开谁收工', () => {
  it('★ begin ⇒ armed，把目标、那一页、那一下、捕获文件都记下', () => {
    const store = createRecordStore();
    const state = held(store.begin(pact('s1', 1000)));

    expect(state.phase).toBe('armed');
    expect(state.unit).toBe('demo');
    expect(state.url).toBe('https://inventory.example.com/env');
    expect(state.action).toBe('发布');
    expect(state.expect).toEqual({ method: 'POST', urlContains: '/api/publish' });
    expect(state.captureFile).toBe('/w/diy/shots/rec-demo.jsonl');
    expect(state.startedAt).toBe(1000);
    expect(state.t0).toBeNull();
    expect(state.t1).toBeNull();
    expect(store.live(1000)).toEqual(state);
  });

  it('★★ 另一场占着就不许再开；同一个会话再来一次 ⇒ already-held', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    expect(store.begin(pact('s2', 1200))).toEqual({ ok: false, code: 'held-by-other' });
    expect(store.begin(pact('s1', 1300))).toEqual({ ok: false, code: 'already-held' });
    expect(store.live(1300)?.sessionId).toBe('s1');
  });

  it('★ 用户按「开始」⇒ recording，t0 是他按的那一刻（不是 store 收到的那一刻）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    const state = held(store.started('s1', 2000, 2001));
    expect(state.phase).toBe('recording');
    expect(state.t0).toBe(2000);
    expect(state.at).toBe(2001);
    expect(state.startedAt).toBe(1000);
  });

  it('★ 用户按「结束」⇒ finished，t1 落下来；再按一次「结束」⇒ not-recording', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));
    store.started('s1', 2000, 2001);

    const state = held(store.finished('s1', 5000, 5002));
    expect(state.phase).toBe('finished');
    expect(state.t1).toBe(5000);
    expect(store.finished('s1', 6000, 6000)).toEqual({ ok: false, code: 'not-recording' });
  });

  it('★★ 阶段不对就说清是哪一档：还没开始就结束 / 已经开始又按开始', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    expect(store.finished('s1', 1500, 1500)).toEqual({ ok: false, code: 'not-recording' });

    store.started('s1', 2000, 2000);
    expect(store.started('s1', 2100, 2100)).toEqual({ ok: false, code: 'already-recording' });

    store.finished('s1', 3000, 3000);
    expect(store.started('s1', 3100, 3100)).toEqual({ ok: false, code: 'not-armed' });
  });

  it('★★ 一场就一个周期：finished 之后回不去了（没有「再录一段」，要重录就重新 begin 一场）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));
    store.started('s1', 2000, 2000);
    store.finished('s1', 3000, 3000);

    const state = store.live(3000);
    expect(state?.phase).toBe('finished');
    expect(state?.t0).toBe(2000);
    expect(state?.t1).toBe(3000);
    expect(store.started('s1', 3100, 3100)).toEqual({ ok: false, code: 'not-armed' });
    expect(store.finished('s1', 3200, 3200)).toEqual({ ok: false, code: 'not-recording' });
    expect(store.live(3300)?.phase).toBe('finished');
  });

  it('★ 收工把它清干净（取消那一拍也走它）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    const stopped = held(store.stop('s1', 1500));
    expect(stopped.unit).toBe('demo');
    expect(store.live(1500)).toBeNull();
    expect(store.stop('s1', 1600)).toEqual({ ok: false, code: 'none' });
  });

  it('★★ 别人不许动我这一场（not-owner）；没开过 ⇒ none', () => {
    const store = createRecordStore();

    expect(store.started('s1', 1000, 1000)).toEqual({ ok: false, code: 'none' });
    expect(store.finished('s1', 1000, 1000)).toEqual({ ok: false, code: 'none' });
    expect(store.stop('s1', 1000)).toEqual({ ok: false, code: 'none' });

    store.begin(pact('s1', 1000));
    expect(store.started('s2', 1100, 1100)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.finished('s2', 1100, 1100)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.stop('s2', 1100)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.live(1100)?.sessionId).toBe('s1');
  });

  it('★ 过期当它不存在（15 分钟没人管就放别人进来）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    expect(store.live(1000 + RECORD_STALE_MS)).not.toBeNull();
    expect(store.live(1001 + RECORD_STALE_MS)).toBeNull();
    expect(store.begin(pact('s2', 1001 + RECORD_STALE_MS)).ok).toBe(true);
    expect(store.live(1001 + RECORD_STALE_MS)?.sessionId).toBe('s2');
  });

  it('★ 录制中不被 TTL 拽走：at 每动一次就续上（他正在那一页上操作）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    const late = 1000 + RECORD_STALE_MS;
    const state = held(store.started('s1', late, late));
    expect(state.phase).toBe('recording');
    expect(state.startedAt).toBe(1000);
    expect(store.live(late + RECORD_STALE_MS)).not.toBeNull();
    expect(store.live(late + RECORD_STALE_MS + 1)).toBeNull();
  });

  it('★ 占着的那句话里有会话、时间和要录的是什么（另一场要看得懂是谁占的）', () => {
    const store = createRecordStore();
    const state = held(store.begin(pact('s1', 1000)));
    const text = recordOwnerText(state);

    expect(text).toContain('s1');
    expect(text).toContain('demo');
    expect(text).toContain('发布');
  });
});

describe('用户在左栏按的三个键：意图词表只此一份', () => {
  it('★ 认得出三个，其余一律 null（别把别的字当成指令）', () => {
    expect(parseRecordIntent('peek')).toBe('peek');
    expect(parseRecordIntent('halt')).toBe('halt');
    expect(parseRecordIntent('stop')).toBe('stop');
    for (const bad of ['', 'PEEK', 'Peek', 'cancel', 'kill', 'end', null, undefined, 1, {}, []]) {
      expect(parseRecordIntent(bad)).toBeNull();
    }
  });
});

describe('他按「截图」：只记那个数，不记账、不重试', () => {
  it('★★ begin 时 0；记过一次就跟到那个数；别人的会话不许写', () => {
    const store = createRecordStore();
    expect(held(store.begin(pact('s1', 1000))).shotsSeen).toBe(0);

    const seen = held(store.shotSeen('s1', 2, 1100));
    expect(seen.shotsSeen).toBe(2);
    expect(seen.at).toBe(1100);

    expect(store.shotSeen('s2', 3, 1200)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.live(1200)?.shotsSeen).toBe(2);
  });
});
