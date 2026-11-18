import { clockOf } from '../runtime/time.js';
import { beginMove, createHold } from './hold.js';
/**
 * 录制交接的三个相位：`armed` 等用户在外站页面上动手，`recording` 正在录，`finished` 录完待取。
 */
export type RecordPhase = 'armed' | 'recording' | 'finished';

/**
 * 录制约定的有效期（15 分钟，毫秒）：超过它没动静的约定算过期、当场让人。
 */
export const RECORD_STALE_MS = 15 * 60 * 1000;

/**
 * 这次录制要找的那一次写：HTTP 方法 + URL 里必须含的一段（不填就是只认方法）。
 */
export interface RecordExpect {
  readonly method: string;
  readonly urlContains: string;
}

/**
 * 一份活着的录制约定：相位 + 谁的会话 + 哪个工作区 / 单元 + 页面 URL 与标题 + 要找的那一次写 +
 * 落盘文件 + 三个时间戳。
 */
export interface RecordState {
  readonly phase: RecordPhase;
  readonly sessionId: string;
  readonly workspace: string;
  readonly unit: string;
  readonly name: string;
  readonly url: string;
  readonly title: string;
  readonly action: string;
  readonly expect: RecordExpect | null;
  readonly captureFile: string;
  readonly startedAt: number;
  readonly t0: number | null;
  readonly t1: number | null;
  readonly shotsSeen: number;
  readonly at: number;
}

/**
 * 开一次录制要交的那几件：会话、工作区、单元、名字、页面 URL 与标题、动作名、期望、落盘文件，以及此刻时间。
 */
export interface RecordPact {
  readonly sessionId: string;
  readonly workspace: string;
  readonly unit: string;
  readonly name: string;
  readonly url: string;
  readonly title: string;
  readonly action: string;
  readonly expect: RecordExpect | null;
  readonly captureFile: string;
  readonly now: number;
}

/**
 * 录制被拒的原因码：自己已持有 / 别人持着 / 不是持有者 / 没有约定 / 已在录 / 还没 arm / 不在录 / 还没录完。
 */
export type RecordRefusal =
  | 'already-held'
  | 'held-by-other'
  | 'not-owner'
  | 'none'
  | 'already-recording'
  | 'not-armed'
  | 'not-recording'
  | 'not-finished';

/**
 * 一次录制动作的结果：成功带新状态，失败带拒绝码。
 */
export type RecordMove =
  | { readonly ok: true; readonly state: RecordState }
  | { readonly ok: false; readonly code: RecordRefusal };

/**
 * 录制约定收得下的三个人话动作：看看进度 / 停手 / 结束并取回。
 */
export type RecordIntent = 'peek' | 'halt' | 'stop';

/**
 * 把工具入参收成人话动作。
 * @param raw - 任意入参值。
 * @returns `'peek'` / `'halt'` / `'stop'` 原样；别的值（含 `undefined`、多余空白）给 `null`，由调用方拒。
 */
export function parseRecordIntent(raw: unknown): RecordIntent | null {
  return raw === 'peek' || raw === 'halt' || raw === 'stop' ? raw : null;
}

/**
 * 录制约定的存取口（外壳持有一份）：相位随 `begin → started → finished` 推进，`release` 是收尾时放掉浏览器那一跳。
 */
export interface RecordStore {
  readonly release?: ((state: RecordState) => Promise<{ readonly tab: boolean; readonly capture: boolean }>) | undefined;
  live(now: number): RecordState | null;
  begin(pact: RecordPact): RecordMove;
  started(sessionId: string, at: number, now: number): RecordMove;
  finished(sessionId: string, at: number, now: number): RecordMove;
  shotSeen(sessionId: string, n: number, now: number): RecordMove;
  stop(sessionId: string, now: number): RecordMove;
}

function recordSeedOf(pact: RecordPact, now: number): RecordState {
  const who = { sessionId: pact.sessionId, workspace: pact.workspace, unit: pact.unit, name: pact.name };
  const page = { url: pact.url, title: pact.title };
  return {
    phase: 'armed',
    ...who,
    ...page,
    action: pact.action,
    expect: pact.expect,
    captureFile: pact.captureFile,
    startedAt: now,
    t0: null,
    t1: null,
    shotsSeen: 0,
    at: now,
  };
}

/**
 * 造一份新的录制约定存储（进程内存，同一时刻只可能有一份有效约定）。
 * @returns 存取口；动作成不成都在返回的 `RecordMove` 里，不抛异常。
 */
export function createRecordStore(): RecordStore {
  const hold = createHold<RecordState>(RECORD_STALE_MS);

  return {
    live: (now) => hold.live(now),

    begin: (pact) => beginMove(hold, pact, recordSeedOf),

    started(sessionId, at, now) {
      return hold.move(sessionId, now, (found) => {
        if (found.phase === 'recording') return { ok: false, code: 'already-recording' };
        if (found.phase !== 'armed') return { ok: false, code: 'not-armed' };
        return { ok: true, state: { ...found, phase: 'recording', t0: at, at: now } };
      });
    },

    finished(sessionId, at, now) {
      return hold.move(sessionId, now, (found) =>
        found.phase === 'recording'
          ? { ok: true, state: { ...found, phase: 'finished', t1: at, at: now } }
          : { ok: false, code: 'not-recording' },
      );
    },

    shotSeen(sessionId, n, now) {
      return hold.move(sessionId, now, (found) => ({ ok: true, state: { ...found, shotsSeen: n, at: now } }));
    },

    stop(sessionId, now) {
      return hold.release(sessionId, now);
    },
  };
}

/**
 * 「谁还占着、在录哪个动作」的一句话，用于别人来抢时说清现况。
 * @param state - 当前有效的那份约定。
 * @returns 形如「会话 x（自 HH:mm:ssZ 起在录 y 的「动作」）」的中文串。
 */
export function recordOwnerText(state: RecordState): string {
  const at = clockOf(state.startedAt);
  return `会话 ${state.sessionId}（自 ${at}Z 起在录 ${state.unit} 的「${state.action}」）`;
}
