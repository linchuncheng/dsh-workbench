import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { cmdNameOf, failureSummaryOf, quoteShellArg, quoteShellArgFor, shellKindOf, tailLines } from '../shell-text.js';

function shellSees(value: string): string {
  return execFileSync('/bin/sh', ['-c', `printf '%s' ${quoteShellArg(value)}`], {
    encoding: 'utf8',
  });
}

describe.skipIf(process.platform === 'win32')('quoteShellArg（POSIX /bin/sh）', () => {
  it('普通值原样往返', () => {
    expect(shellSees('example-monorepo')).toBe('example-monorepo');
  });

  it('含空格的路径不被拆成两个参数', () => {
    expect(shellSees('/Volumes/My Projects/app')).toBe('/Volumes/My Projects/app');
  });

  it('单引号被正确转义（否则就是注入面）', () => {
    expect(shellSees("it's")).toBe("it's");
  });

  it('shell 元字符按字面量传递', () => {
    for (const raw of ['$(whoami)', '`id`', 'a; rm -rf /', 'a && b', '*', '"double"', '\\n']) {
      expect(shellSees(raw), raw).toBe(raw);
    }
  });
});

describe('tailLines', () => {
  it('取末尾若干行并去掉首尾空行', () => {
    expect(tailLines('\n a \n b \n', 2)).toBe('a \n b');
  });

  it('行数不够时全给', () => {
    expect(tailLines('only', 6)).toBe('only');
  });

  it('空输入给空串', () => {
    expect(tailLines(undefined, 3)).toBe('');
    expect(tailLines('   ', 3)).toBe('');
  });
});

describe('failureSummaryOf（失败原文：留错误行，不留首行噪音）', () => {
  const TLS_FAILURE = [
    'Update available! 11.28.5 → 12.21.0.',
    '[ERR_PNPM_META_FETCH_FAIL] GET https://registry.npmjs.org/@jackwener%2Fopencli: request failed, reason: socket hang up',
    '',
    '    at Request.onError (file:///Applications/pnpm.mjs:70375:31)',
    '    at Object.errorRequest (file:///Applications/pnpm.mjs:69717:18)',
    '    at TLSSocket.onHttpSocketClose (file:///Applications/pnpm.mjs:75346:15)',
    '    at TLSSocket.emit (node:events:526:24)',
  ].join('\n');

  it('★ pnpm 的更新提示占首行时：真正的 ERR_PNPM 行要留下（以前只剩首行 + 栈尾）', () => {
    const summary = failureSummaryOf(TLS_FAILURE);

    expect(summary.split('\n')[0]).toContain('ERR_PNPM_META_FETCH_FAIL');
    expect(summary).toContain('TLSSocket.onHttpSocketClose');
    expect(summary).not.toContain('Update available!');
  });

  it('★ 首行本来就是错误码：首行不动，尾部照留（store 报错靠首行判重装）', () => {
    const store = [
      ' ERR_PNPM_UNEXPECTED_STORE  Unexpected store location',
      '',
      'The dependencies are linked from another store.',
      'Reinstall your dependencies.',
      'You may change the global store location.',
      '(This error may happen if the node_modules was installed with a different major version of pnpm)',
    ].join('\n');

    const summary = failureSummaryOf(store);

    expect(summary.split('\n')[0]).toBe('ERR_PNPM_UNEXPECTED_STORE  Unexpected store location');
    expect(summary).toContain('different major version of pnpm');
  });

  it('没有明显错误行时保持旧行为：首行 + 末尾几行', () => {
    expect(failureSummaryOf('one\ntwo\nthree')).toBe('one\ntwo\nthree');
    expect(failureSummaryOf('a\nb\nc\nd\ne\nf', 3)).toBe('a\nd\ne\nf');
  });

  it('空输入给空串；只剩噪音时原样留下', () => {
    expect(failureSummaryOf(undefined)).toBe('');
    expect(failureSummaryOf('   \n')).toBe('');
    expect(failureSummaryOf('Update available! 1.0.0 → 2.0.0.')).toBe('Update available! 1.0.0 → 2.0.0.');
  });

  it('去掉 ANSI 颜色，长行截断', () => {
    expect(failureSummaryOf('\u001b[31mError:\u001b[39m boom')).toBe('Error: boom');
    const long = `Error: ${'x'.repeat(500)}`;
    expect(failureSummaryOf(long)).toHaveLength(401);
  });
});


describe('quoteShellArgFor', () => {
  it('★ win32 按 pwsh 的字面量走：单引号，路径里的空格与反斜杠都原样', () => {
    expect(quoteShellArgFor('C:\\Program Files\\dsh\\x.cjs', 'win32')).toBe("'C:\\Program Files\\dsh\\x.cjs'");
  });

  it('★ pwsh 里值自身的单引号按双写逃逸（不是 POSIX 那套反斜杠）', () => {
    expect(quoteShellArgFor("it's", 'win32')).toBe("'it''s'");
  });

  it('★ pwsh 里 $ 与双引号不再被当成语法（单引号内是字面量）', () => {
    expect(quoteShellArgFor('a$b"c', 'win32')).toBe(`'a$b"c'`);
  });

  it('POSIX 仍用单引号加反斜杠逃逸', () => {
    expect(quoteShellArgFor("it's", 'darwin')).toBe("'it'\\''s'");
  });
});

describe.skipIf(process.platform !== 'win32')('quoteShellArg（Windows pwsh）', () => {
  it('经真 pwsh 解析后原样往返', { timeout: 30000 }, () => {
    for (const raw of ["it's", '$HOME', 'a;b', 'a && b']) {
      const out = execFileSync(
        'pwsh',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `[Console]::Out.Write(${quoteShellArg(raw)})`],
        { encoding: 'utf8' },
      );
      expect(out, raw).toBe(raw);
    }
  });
});

describe('shellKindOf', () => {
  it('win32 是 pwsh，其余是 POSIX', () => {
    expect(shellKindOf('win32')).toBe('pwsh');
    expect(shellKindOf('darwin')).toBe('posix');
    expect(shellKindOf('linux')).toBe('posix');
  });
});

describe('cmdNameOf', () => {
  it('★ win32 的包装器带 .cmd，其余平台原样', () => {
    expect(cmdNameOf('pnpm', 'win32')).toBe('pnpm.cmd');
    expect(cmdNameOf('opencli', 'win32')).toBe('opencli.cmd');
    expect(cmdNameOf('pnpm', 'darwin')).toBe('pnpm');
    expect(cmdNameOf('opencli', 'linux')).toBe('opencli');
  });
});
