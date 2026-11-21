import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDiagRecorder } from '@dsh-workbench/shared/host';
import { exportDiagBundle } from '../diag-export.js';

function recorderOf() {
  let at = 1_000;
  return createDiagRecorder({ clock: () => (at += 10), nextCorrId: () => 'c-1', level: 'info' });
}

const AT = '2026-11-21T10:00:00.000Z';

describe('导出诊断目录', () => {
  it('★ 成功：写出目录并回路径与大小', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-export-'));
    const recorder = recorderOf();
    recorder.record({ code: 'READ_FAILED' });

    const result = exportDiagBundle({
      recorder,
      root,
      at: AT,
      env: { node: '24' },
      config: { deps: 1 },
      runtime: { panels: [] },
      checks: { swallow: 514 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fs.existsSync(path.join(result.dir, 'manifest.json'))).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('★ 写不进去：回错误码并记一条 DIAG_SINK_FAILED（不抛）', () => {
    const recorder = recorderOf();
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-export-ro-'));
    const blocker = path.join(parent, 'blocker');
    fs.writeFileSync(blocker, 'x');

    try {
      const result = exportDiagBundle({
        recorder,
        root: path.join(blocker, 'nope'),
        at: AT,
        env: {},
        config: {},
        runtime: {},
        checks: {},
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('DIAG_SINK_FAILED');
      const records = recorder.recent({ code: 'DIAG_SINK_FAILED' });
      expect(records).toHaveLength(1);
      expect(typeof records[0]?.detail?.['reason']).toBe('string');
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});
