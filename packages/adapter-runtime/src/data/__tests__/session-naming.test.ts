import { describe, expect, it } from 'vitest';
import { readSessionOf } from '../types.js';

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
