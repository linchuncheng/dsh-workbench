import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { diagExportAction, DIAG_EXPORT_RESOURCE } from '../diag-export-action.js';

let root = '';
const ctx = { get: () => undefined } as unknown as DshHostContext;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-export-action-'));
  process.env['DSH_WORKBENCH_HOME'] = root;
});

afterEach(() => {
  delete process.env['DSH_WORKBENCH_HOME'];
  fs.rmSync(root, { recursive: true, force: true });
});

describe('导出诊断目录的动作', () => {
  it('★ 资源名固定，调用一次产出目录并在包内清单里', async () => {
    const action = diagExportAction(ctx);
    expect(action.resource).toBe(DIAG_EXPORT_RESOURCE);

    const result = (await action.handle({})) as { ok: boolean; dir: string };

    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(result.dir, 'manifest.json'))).toBe(true);
  });

  it('★ 只读：导出只写诊断目录，不额外写记录分片', async () => {
    const action = diagExportAction(ctx);

    await action.handle({});

    expect(fs.existsSync(path.join(root, 'diagnostics'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'diagnostics', 'records'))).toBe(false);
  });
});
