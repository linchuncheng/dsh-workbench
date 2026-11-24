import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPENCLI_PIN } from '@dsh-workbench/shared/host';
import { isOpencliAtPin, isOpencliAtPinAt, isOpencliReady, isOpencliReadyAt, opencliBuiltAt, opencliReadiness, opencliReadinessAt } from '../index.js';

function seedProject(projectDir: string, version: string, main: boolean): void {
  const dir = join(projectDir, 'node_modules', '@jackwener', 'opencli');
  mkdirSync(join(dir, 'dist', 'src'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version })}\n`, 'utf8');
  if (main) writeFileSync(join(dir, 'dist', 'src', 'main.js'), '', 'utf8');
}

function seedCopy(root: string, version: string, main: boolean): void {
  seedProject(join(root, 'opencli', 'toolchain'), version, main);
}

const roots: string[] = [];

function homeOf(): string {
  const root = mkdtempSync(join(tmpdir(), 'opencli-ready-'));
  roots.push(root);
  vi.stubEnv('DSH_WORKBENCH_HOME', root);
  return root;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('opencliReadiness', () => {
  it('副本不在 → 未就绪', () => {
    homeOf();
    const verdict = opencliReadiness();
    expect(verdict.ready).toBe(false);
    expect(verdict.detail).toContain('不在');
  });

  it('只有 package.json、没有 dist/src/main.js → 未就绪', () => {
    const root = homeOf();
    seedCopy(root, OPENCLI_PIN, false);
    const verdict = opencliReadiness();
    expect(verdict.ready).toBe(false);
    expect(verdict.detail).toContain('dist/src/main.js');
  });

  it('★★ 版本在支持的范围内（1.8.8）→ 就绪：能用就不拦，对齐 pin 是另一回事', () => {
    const root = homeOf();
    seedCopy(root, '1.8.8', true);
    const verdict = opencliReadiness();
    expect(verdict.ready).toBe(true);
    expect(verdict.detail).toBe('1.8.8');
    expect(isOpencliAtPin()).toBe(false);
  });

  it('★ 装的就是 pin → 对齐', () => {
    const root = homeOf();
    seedCopy(root, OPENCLI_PIN, true);
    expect(isOpencliAtPin()).toBe(true);
    expect(isOpencliAtPinAt(join(root, 'opencli', 'toolchain'))).toBe(true);
  });

  it('版本出了范围（0.0.1）→ 未就绪，并说清范围与实装', () => {
    const root = homeOf();
    seedCopy(root, '0.0.1', true);
    const verdict = opencliReadiness();
    expect(verdict.ready).toBe(false);
    expect(verdict.detail).toContain('0.0.1');
    expect(verdict.detail).toContain('>=1.8.0 <3.0.0');
  });

  it('★ 按项目目录判：暂存目录不用换环境就能自检', () => {
    const root = mkdtempSync(join(tmpdir(), 'opencli-staging-'));
    roots.push(root);
    const project = join(root, 'toolchain.staging-x');
    seedProject(project, OPENCLI_PIN, true);

    expect(isOpencliReadyAt(project)).toBe(true);
    expect(opencliReadinessAt(project).detail).toBe(OPENCLI_PIN);
  });

  it('读 .ready.json 的装好时间；没有就返回 undefined', () => {
    const root = mkdtempSync(join(tmpdir(), 'opencli-marker-'));
    roots.push(root);
    const project = join(root, 'toolchain');

    expect(opencliBuiltAt(project)).toBeUndefined();
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, '.ready.json'), '{"pin":"1.8.8","at":"2026-11-13T00:00:00.000Z"}\n');
    expect(opencliBuiltAt(project)).toBe('2026-11-13T00:00:00.000Z');
  });

  it('清单、入口、版本都对 → 就绪', () => {
    const root = homeOf();
    seedCopy(root, OPENCLI_PIN, true);
    expect(isOpencliReady()).toBe(true);
    expect(opencliReadiness().detail).toBe(OPENCLI_PIN);
  });
});
