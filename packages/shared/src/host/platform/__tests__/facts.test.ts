import { describe, expect, it } from 'vitest';

import { cmdNameOf, shellKindOf } from '../../shell/shell-text.js';
import { hostOsOf } from '../facts.js';

describe('宿主机事实', () => {
  it('认三台宿主 OS，其余归 other', () => {
    expect(hostOsOf('darwin')).toBe('darwin');
    expect(hostOsOf('win32')).toBe('win32');
    expect(hostOsOf('linux')).toBe('linux');
    expect(hostOsOf('freebsd')).toBe('other');
  });

  it('shell 种类与可执行名都从同一份事实派生', () => {
    expect(shellKindOf('win32')).toBe('pwsh');
    expect(shellKindOf('darwin')).toBe('posix');
    expect(shellKindOf('linux')).toBe('posix');
    expect(cmdNameOf('opencli', 'win32')).toBe('opencli.cmd');
    expect(cmdNameOf('opencli', 'linux')).toBe('opencli');
  });
});
