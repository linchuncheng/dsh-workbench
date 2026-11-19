import { describe, expect, it } from 'vitest';

import { toolLookupOf } from '../tool-lookup.js';

describe('工具查找命令', () => {
  it('Windows 走 where.exe，POSIX 走 command -v', () => {
    expect(toolLookupOf('git', 'win32')).toEqual({
      line: "where.exe 'git'",
      shellKind: 'pwsh',
    });
    expect(toolLookupOf('git', 'darwin')).toEqual({
      line: "command -v 'git'",
      shellKind: 'posix',
    });
    expect(toolLookupOf("Bob's", 'linux').line).toBe("command -v 'Bob'\\''s'");
  });
});
