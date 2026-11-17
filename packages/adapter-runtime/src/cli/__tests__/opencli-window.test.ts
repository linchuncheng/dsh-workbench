import { describe, expect, it } from 'vitest';
import { backgroundLine } from '../opencli-window.js';

describe('backgroundLine：给后台读的浏览器命令', () => {
  it('★ 会话写成 --session（2.x 的写法）', () => {
    const line = backgroundLine('opencli', ['browser', 'Read', 'open', 'https://x.test'], { platform: 'darwin' });

    expect(line).toBe("'opencli' 'browser' '--session' 'Read' 'open' 'https://x.test'");
  });

  it('★ 每个词都单独引号：参数里有空格也不会被拆开', () => {
    const line = backgroundLine('opencli', ['browser', 'Read', 'type', 'hello world'], { platform: 'darwin' });

    expect(line).toContain("'hello world'");
    expect(line).not.toContain("'hello' 'world'");
  });

  it('★ 1.x：给了位置参数方言就不插 --session', () => {
    const line = backgroundLine('opencli', ['browser', 'Read', 'get', 'url'], {
      platform: 'darwin',
      dialect: 'positional',
    });

    expect(line).toBe("'opencli' 'browser' 'Read' 'get' 'url'");
  });
});
