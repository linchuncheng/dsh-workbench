import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root = '';
let cwd = '';

function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function writeModule(dir, css) {
  writeFile(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: '@acme/broken-style', version: '1.0.0', dsh: { workbench: { unit: 'broken-style' } } }, null, 2)}\n`,
  );
  writeFile(path.join(dir, 'src', 'Panel.module.css'), css);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-style-'));
  cwd = process.cwd();
  writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'fixture-root', private: true }, null, 2)}\n`);
  writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
  process.env.DSH_WB_ROOT = root;
  process.chdir(root);
});

afterEach(() => {
  process.chdir(cwd);
  delete process.env.DSH_WB_ROOT;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('样式归属判据：解析失败不等于通过', () => {
  it('★ 一份解析不了的样式表：判红，并指明是哪个文件（不是零发现通过）', async () => {
    writeModule(path.join(root, 'packages', 'broken-style'), '.field {\n  gap: 8px;\n');
    const style = await import('../style.mjs');

    const result = await style.run();

    expect(result.status).toBe('fail');
    const text = result.problems.join('\n');
    expect(text).toContain('Panel.module.css');
    expect(text).toContain('解析不了');
  });

  it('能解析的样式表不因此判红（没有借题发挥）', async () => {
    writeModule(path.join(root, 'packages', 'broken-style'), '.field {\n  color: var(--wb-text);\n}\n');
    const style = await import('../style.mjs');

    const result = await style.run();

    expect(result.problems.join('\n')).not.toContain('解析不了');
  });
});
