import { describe, expect, it } from 'vitest';
import { dockSessionId } from '../dock-session';

describe('输入卡上方那条槽位拿到的会话号', () => {
  it('★ 传进来的是会话快照就读它的 sessionId', () => {
    expect(dockSessionId({ sessionId: 'session-1' })).toBe('session-1');
  });

  it('★ 传进来的已经是字符串就原样用', () => {
    expect(dockSessionId('session-2')).toBe('session-2');
  });

  it('★ 认不出来就回空串，别把 undefined 拼进请求', () => {
    expect(dockSessionId(undefined)).toBe('');
    expect(dockSessionId({})).toBe('');
  });
});
