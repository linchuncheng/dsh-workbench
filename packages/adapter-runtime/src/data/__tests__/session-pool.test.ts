import { describe, expect, it } from 'vitest';
import { createSessionPool } from '../session-pool.js';

function poolOf(max: number) {
  const closed: string[] = [];
  const pool = createSessionPool({ max, close: (session) => closed.push(session) });
  return { pool, closed };
}

describe('读会话池：上限与 LRU', () => {
  it('★ 没超上限：一个都不关', () => {
    const { pool, closed } = poolOf(2);
    pool.touch('a');
    pool.touch('b');

    expect(closed).toEqual([]);
  });

  it('★ 超了上限：关掉最久没动的那个', () => {
    const { pool, closed } = poolOf(2);
    pool.touch('a');
    pool.touch('b');
    pool.touch('a');
    pool.touch('c');

    expect(closed).toEqual(['b']);
  });

  it('★ 正在读的会话不关（哪怕它最久没动）：暂时多一个，等它读完再收', () => {
    const { pool, closed } = poolOf(1);
    pool.hold('busy');
    pool.touch('other');

    expect(closed).toEqual([]);
  });

  it('★ 读完放开后才轮到回收：留下最近用过的，关掉更久没用的', () => {
    const { pool, closed } = poolOf(1);
    pool.hold('busy');
    pool.touch('other');
    pool.idle('busy');

    expect(closed).toEqual(['other']);
  });
});

describe('闲置回收：不是只有超额才关', () => {
  it('★ 闲置超过阈值 → 列出来（由上层关掉）', async () => {
    const { pool, closed } = poolOf(8);
    pool.touch('old');
    await new Promise((resolve) => setTimeout(resolve, 5));
    pool.touch('fresh');

    expect(pool.expire(3)).toEqual(['old']);
    expect(closed).toEqual([]);
  });

  it('★ 阈值是 0 或负数 → 一个都不收（当开关用）', () => {
    const { pool } = poolOf(8);
    pool.touch('a');

    expect(pool.expire(0)).toEqual([]);
  });

  it('★ 正在读的不收', async () => {
    const { pool } = poolOf(8);
    pool.hold('busy');
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(pool.expire(3)).toEqual([]);
  });

  it('★ 收过的下次不再出现（幂等）', async () => {
    const { pool } = poolOf(8);
    pool.touch('a');
    await new Promise((resolve) => setTimeout(resolve, 5));
    pool.expire(3);

    expect(pool.expire(3)).toEqual([]);
  });
});
