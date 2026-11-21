import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { PANEL_STATE_SERVICE } from '@dsh-workbench/shared/host';
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
  it('★ 收集到 profile 摘要与面板读数快照', async () => {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-profile-'));
    fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({ name: 'workbench', dependencies: { '@x/missing': '1.0.0' } }), 'utf8');
    const panelStore = { snapshot: () => ({ workspace: null, at: 1, units: [] }) };
    const ctxWithProfile = {
      get: (name: string) => {
        if (name === 'profileContext') return { dir: profileDir };
        if (name === PANEL_STATE_SERVICE) return panelStore;
        return undefined;
      },
    } as unknown as DshHostContext;

    const result = (await diagExportAction(ctxWithProfile).handle({})) as { ok: boolean; dir: string };
    const config = JSON.parse(fs.readFileSync(path.join(result.dir, 'config.json'), 'utf8')) as Record<string, unknown>;
    const runtime = JSON.parse(fs.readFileSync(path.join(result.dir, 'runtime.json'), 'utf8')) as Record<string, unknown>;

    expect(config['name']).toBe('workbench');
    expect((config['unreadable'] as unknown[]).length).toBe(1);
    expect(runtime['panels']).toBeTruthy();
    expect((runtime['logs'] as Record<string, unknown>)['selfUpdate']).toBeNull();
    fs.rmSync(profileDir, { recursive: true, force: true });
  });

  it('★ 有自更新日志时把尾巴带上', async () => {
    fs.writeFileSync(path.join(root, 'self-update.log'), 'update failed: boom\n', 'utf8');
    const result = (await diagExportAction(ctx).handle({})) as { ok: boolean; dir: string };
    const runtime = JSON.parse(fs.readFileSync(path.join(result.dir, 'runtime.json'), 'utf8')) as Record<string, unknown>;

    expect((runtime['logs'] as Record<string, unknown>)['selfUpdate']).toContain('update failed: boom');
  });

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
