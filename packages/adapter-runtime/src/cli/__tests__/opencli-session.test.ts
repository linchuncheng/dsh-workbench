import { describe, expect, it } from 'vitest';
import { sessionArgv, sessionDialectOf, tabArgv } from '../opencli-session';

describe('会话方言：2.x 从位置参数挪到了 --session，1.x 还是位置参数', () => {
  it('★★ 2.x：browser <session> … → browser --session <session> …', () => {
    expect(sessionArgv(['browser', 'Record', 'tab', 'new', 'https://x.test'], 'flag')).toEqual([
      'browser',
      '--session',
      'Record',
      'tab',
      'new',
      'https://x.test',
    ]);
  });

  it('★★ 1.x：位置参数原样留着，不塞 --session', () => {
    const argv = ['browser', 'Record', 'tab', 'new', 'https://x.test'];
    expect(sessionArgv(argv, 'positional')).toBe(argv);
  });

  it('★ 已经是 --session 的（或没有会话位）原样返回', () => {
    expect(sessionArgv(['browser', '--session', 'Record', 'state'], 'flag')).toEqual([
      'browser',
      '--session',
      'Record',
      'state',
    ]);
    expect(sessionArgv(['browser'])).toEqual(['browser']);
  });

  it('★ 不是 browser 的命令一概不碰', () => {
    const argv = ['opencli', 'plugin', 'list'];
    expect(sessionArgv(argv)).toBe(argv);
  });

  it('★★ 版本决定方言：1.x → 位置参数，2.x / 读不到 → --session', () => {
    expect(sessionDialectOf('1.9.4')).toBe('positional');
    expect(sessionDialectOf('1.0.0-beta.2')).toBe('positional');
    expect(sessionDialectOf('2.0.3')).toBe('flag');
    expect(sessionDialectOf('2.1.0')).toBe('flag');
    expect(sessionDialectOf(undefined)).toBe('flag');
    expect(sessionDialectOf('看不清')).toBe('flag');
  });
});

describe('目标页方言：--tab 只在 2.x 有，1.x 拦掉', () => {
  it('★★ 2.x：--tab 原样留着', () => {
    const argv = ['browser', '--session', 'Record', 'eval', '--tab', 'P1', '1+1'];
    expect(tabArgv(argv, 'flag')).toBe(argv);
  });

  it('★★ 1.x：把 --tab 那一对摘掉，脚本还留在原位', () => {
    expect(tabArgv(['browser', 'Record', 'eval', '--tab', 'P1', '1+1'], 'positional')).toEqual([
      'browser',
      'Record',
      'eval',
      '1+1',
    ]);
  });

  it('★ 没有 --tab 的原样返回', () => {
    const argv = ['browser', 'Record', 'state'];
    expect(tabArgv(argv, 'positional')).toBe(argv);
  });
});
