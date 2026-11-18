import { describe, expect, it } from 'vitest';

import { signalsOf } from '../checks/standalone.mjs';

describe('standalone signals', () => {
  it('windows 只挂 SIGINT', () => {
    expect(signalsOf('win32')).toEqual(['SIGINT']);
  });

  it('posix 挂 SIGINT / SIGTERM / SIGHUP', () => {
    expect(signalsOf('darwin')).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
    expect(signalsOf('linux')).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
  });
});
