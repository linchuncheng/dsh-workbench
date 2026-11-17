import { describe, expect, it } from 'vitest';
import { readSessionOf, writeSessionOf } from '../types.js';

describe('读会话按站点分', () => {
  it('★ 同一站点两次读 → 同一个会话（复用那一个标签）', () => {
    const first = readSessionOf(undefined, 'https://zhihu.com/hot');
    const second = readSessionOf(undefined, 'https://zhihu.com/question/1?x=2');

    expect(first).toBe(second);
    expect(first).toBe('workbench-read-zhihu-com');
  });

  it('★ 不同站点 → 不同会话（并发读不再互相导航）', () => {
    expect(readSessionOf(undefined, 'https://zhihu.com/hot')).not.toBe(
      readSessionOf(undefined, 'https://github.com/trending'),
    );
  });

  it('★ 端口与大小写归一：example.com:8080 与 EXAMPLE.com 各算各的', () => {
    expect(readSessionOf(undefined, 'https://EXAMPLE.com/a')).toBe('workbench-read-example-com');
    expect(readSessionOf(undefined, 'http://example.com:8080/a')).toBe('workbench-read-example-com-8080');
  });

  it('★ 模块显式指定会话 → 照它说的办，不按站点改', () => {
    expect(readSessionOf('my-session', 'https://zhihu.com/hot')).toBe('my-session');
  });

  it('★ 没有 URL（脚本自己找页面）→ 退回默认读会话', () => {
    expect(readSessionOf(undefined, undefined)).toBe('workbench-read');
    expect(readSessionOf(undefined, 'not a url')).toBe('workbench-read');
  });
});

describe('写会话与读会话分开', () => {
  it('★ 同一站点：写不等读的会话，各用各的标签', () => {
    expect(writeSessionOf(undefined, 'https://zhihu.com/x')).not.toBe(
      readSessionOf(undefined, 'https://zhihu.com/x'),
    );
  });

  it('★ 同一站点两次写 → 同一个写会话（串行是对的）', () => {
    expect(writeSessionOf(undefined, 'https://zhihu.com/a')).toBe(
      writeSessionOf(undefined, 'https://zhihu.com/b'),
    );
  });

  it('★ 不同站点 → 不同写会话', () => {
    expect(writeSessionOf(undefined, 'https://a.example.com')).not.toBe(
      writeSessionOf(undefined, 'https://b.example.com'),
    );
  });

  it('★ 模块显式指定会话时，写仍单独一份（不覆盖模块自己的读会话）', () => {
    expect(writeSessionOf('mine', 'https://zhihu.com')).toBe('mine-write');
    expect(readSessionOf('mine', 'https://zhihu.com')).toBe('mine');
  });

  it('★ 没有 URL → 退回默认写会话', () => {
    expect(writeSessionOf(undefined, undefined)).toBe('workbench-write');
  });
});
