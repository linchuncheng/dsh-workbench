import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { callOperatorOf } from '../shell-render.js';
import { quoteShellArgFor } from '../shell-text.js';

const NASTY = [
  'const pick = (one) => one?.value ?? null;',
  'if (a && b || c) { stash["x"] = `100% ${a}`; }',
  "el.setAttribute('data-x', \"a&b|c<d>e\");",
  'const re = /^[a-z]+$/i; ',
].join(' ');

function shimOf(root: string): { readonly cmd: string } {
  const js = join(root, 'print.js');
  const cmd = join(root, 'print.cmd');
  writeFileSync(js, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
  writeFileSync(cmd, `@node "%~dp0print.js" %*\r\n`);
  return { cmd };
}

function enginesOf(): readonly string[] {
  return ['pwsh', 'powershell'].filter((one) => {
    const probe = spawnSync(one, ['-NoProfile', '-Command', 'exit 0'], { encoding: 'utf8' });
    return probe.status === 0;
  });
}

function encodedOf(script: string): string {
  return `Function(decodeURIComponent(escape(atob('${Buffer.from(script, 'utf8').toString('base64')}'))))()`;
}

describe('Windows：命令拼接后子进程收到的原样字节', () => {
  it.runIf(process.platform === 'win32')('★★ 带引号 / & / | / % / 括号的负载原样到达', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-quote-'));
    const { cmd } = shimOf(root);
    const engines = enginesOf();
    expect(engines.length).toBeGreaterThan(0);
    for (const engine of engines) {
      const payload = encodedOf(NASTY);
      const line = [quoteShellArgFor(cmd, 'win32'), quoteShellArgFor(payload, 'win32')].join(' ');
      const run = spawnSync(engine, ['-NoProfile', '-NonInteractive', '-Command', callOperatorOf('pwsh', line)], {
        encoding: 'utf8',
      });
      const received = run.stdout.trim() === '' ? [] : (JSON.parse(run.stdout) as string[]);
      expect({ engine, received }).toEqual({ engine, received: [payload] });
    }
  });
});
