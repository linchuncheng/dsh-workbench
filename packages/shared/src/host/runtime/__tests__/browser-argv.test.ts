import { describe, expect, it } from 'vitest';
import { sessionArgv } from '../browser-argv.js';

describe('sessionArgv：2.x 把会话从位置参数挪到了 --session', () => {
  it('★ browser <session> … → browser --session <session> …', () => {
    expect(sessionArgv(['browser', 'Record', 'tab', 'new', 'https://x.test'])).toEqual([
      'browser',
      '--session',
      'Record',
      'tab',
      'new',
      'https://x.test',
    ]);
  });

  it('★ 已经是 --session 的（或没有会话位）原样返回', () => {
    expect(sessionArgv(['browser', '--session', 'Record', 'state'])).toEqual([
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
});
