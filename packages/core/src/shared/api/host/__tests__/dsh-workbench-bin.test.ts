import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const bin = fileURLToPath(new URL('../../../../../bin/dsh-workbench.mjs', import.meta.url));

describe('dsh-workbench bin', () => {
  it('在对应平台上走到 bash 或给出 Windows 提示', () => {
    const result = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
    if (process.platform === 'win32') {
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Windows');
      return;
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('工作台');
  });
});
