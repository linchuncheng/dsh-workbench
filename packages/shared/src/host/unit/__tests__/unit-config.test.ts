import { describe, expect, it } from 'vitest';
import { createDiagRecorder } from '../../runtime/diag-records.js';
import { createUnitConfig, type UnitConfigStore } from '../unit-config.js';

interface Config {
  readonly name: string;
  readonly limit: number;
}

const FALLBACK: Config = { name: '', limit: 5 };

function normalize(raw: unknown): Config {
  if (typeof raw !== 'object' || raw === null) throw new Error('不是一份配置');
  const record = raw as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'] : '';
  const limit = typeof record['limit'] === 'number' ? record['limit'] : 5;
  return { name, limit };
}

function memoryStore(): UnitConfigStore & {
  readonly file: () => unknown;
  readonly keys: () => string[];
} {
  const files = new Map<string, unknown>();
  return {
    read: (name) => files.get(name) ?? null,
    write: (name, next) => {
      files.set(name, next);
    },
    remove: (name) => {
      files.delete(name);
    },
    file: () => files.get('config.json') ?? null,
    keys: () => [...files.keys()],
  };
}

describe('单元配置的读写器', () => {
  it('★ 没存过：给兜底那份', () => {
    const config = createUnitConfig({ store: memoryStore(), file: 'config.json', fallback: FALLBACK, normalize });
    expect(config.read()).toEqual(FALLBACK);
  });

  it('★ 存过：读回来的是规范化之后的那份', () => {
    const store = memoryStore();
    store.write('config.json', { name: '工作台', limit: 10 });
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    expect(config.read()).toEqual({ name: '工作台', limit: 10 });
  });

  it('★ 存坏了：退回兜底，不把坏数据带出来', () => {
    const store = memoryStore();
    store.write('config.json', 'not-json');
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    expect(config.read()).toEqual(FALLBACK);
  });

  it('★ 写：先规范化再落盘，返回的就是落盘那份', () => {
    const store = memoryStore();
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    const written = config.write({ name: 'a' });
    expect(written).toEqual({ name: 'a', limit: 5 });
    expect(store.file()).toEqual({ name: 'a', limit: 5 });
  });

  it('★ 写不合法：当场抛，不落盘', () => {
    const store = memoryStore();
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    expect(() => config.write(null)).toThrowError('不是一份配置');
    expect(store.file()).toBeNull();
  });

  it('★ 形状不对（JSON 合法）：读回兜底并提醒，原内容不被默认值盖掉', () => {
    const warnings: string[] = [];
    const store = memoryStore();
    store.write('config.json', ['这不是我们要的形状']);
    const config = createUnitConfig({
      store,
      file: 'config.json',
      fallback: FALLBACK,
      normalize: (raw) => {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('不是一份配置');
        return normalize(raw);
      },
      logger: { warn: (message: string) => warnings.push(message) },
    });

    expect(config.read()).toEqual(FALLBACK);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('config.json');

    config.write({ name: '新', limit: 1 });

    const kept = store.read(`.corrupt/config.json.${'x'}`) ?? null;
    expect(kept).toBeNull();
    const keys = store.keys().filter((key: string) => key.startsWith('.corrupt/config.json.'));
    expect(keys).toHaveLength(1);
    expect(store.read(keys[0] as string)).toEqual(['这不是我们要的形状']);
    expect(store.file()).toEqual({ name: '新', limit: 1 });
  });

  it('没存过 / 形状对：不提醒，也不产生备份', () => {
    const warnings: string[] = [];
    const store = memoryStore();
    const config = createUnitConfig({
      store,
      file: 'config.json',
      fallback: FALLBACK,
      normalize,
      logger: { warn: (message: string) => warnings.push(message) },
    });
    expect(config.read()).toEqual(FALLBACK);
    config.write({ name: 'a' });
    expect(warnings).toEqual([]);
    expect(store.keys().filter((key: string) => key.startsWith('.corrupt/'))).toEqual([]);
  });

  it('★ 清空：下次读回兜底', () => {
    const store = memoryStore();
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    config.write({ name: 'a' });
    config.reset();
    expect(config.read()).toEqual(FALLBACK);
  });
});

describe('读不出来的配置：落一条诊断记录', () => {
  function recorderOf() {
    let at = 1_000;
    return createDiagRecorder({ clock: () => (at += 10), nextCorrId: () => 'c-1', level: 'info' });
  }

  it('★ 形状不对时记 CONFIG_CORRUPT，带文件与原因，只记一次', () => {
    const store = memoryStore();
    store.write('config.json', ['这不是我们要的形状']);
    const diag = recorderOf();
    const config = createUnitConfig({
      store,
      file: 'config.json',
      fallback: FALLBACK,
      normalize: (raw) => {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('不是一份配置');
        return normalize(raw);
      },
      diag,
    });

    config.read();
    config.read();

    const records = diag.recent({ code: 'CONFIG_CORRUPT' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ class: 'user', area: 'settings', detail: { path: 'config.json' } });
    expect(typeof records[0]?.detail?.['reason']).toBe('string');
  });

  it('读得出来时零记录（成功不留痕）', () => {
    const store = memoryStore();
    store.write('config.json', { name: '工作台', limit: 1 });
    const diag = recorderOf();
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize, diag });

    config.read();

    expect(diag.recent()).toHaveLength(0);
  });
});
