import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { isDiagCode } from '../contract/blocker.js';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const SOURCE = /\.(?:ts|tsx|mjs|cjs|js)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SKIP = new Set(['node_modules', 'dist', 'coverage', 'site-dist', '__tests__', 'vendor', 'test']);
const RECORD_CALL = /\.record\s*\(/u;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (!SOURCE.test(entry.name) || TEST_FILE.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
    out.push(full);
  }
  return out;
}

export function unregisteredCodesOf(files: readonly { readonly file: string; readonly text: string }[]): string[] {
  const found: string[] = [];
  for (const { file, text } of files) {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        if (node.expression.name.text === 'record') {
          const first = node.arguments[0];
          if (first !== undefined && ts.isObjectLiteralExpression(first)) {
            for (const property of first.properties) {
              if (!ts.isPropertyAssignment(property)) continue;
              if (property.name.getText(sf) !== 'code') continue;
              if (!ts.isStringLiteral(property.initializer)) continue;
              if (!isDiagCode(property.initializer.text)) found.push(`${file}:${property.initializer.text}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}

describe('故障码字面量判据', () => {
  it('★ 表外码判红（负例），表内码判绿（正例）', () => {
    const files = [
      { file: 'a.ts', text: "recorder.record({ code: 'NOT_REGISTERED', detail: { route: 'x' } });" },
      { file: 'b.ts', text: "recorder.record({ code: 'READ_FAILED' });" },
    ];

    expect(unregisteredCodesOf(files)).toEqual(['a.ts:NOT_REGISTERED']);
  });

  it('不误伤：变量传入、别的对象上的 record、字符串里提到码都不算', () => {
    const files = [
      { file: 'a.ts', text: 'recorder.record({ code: someCode });' },
      { file: 'b.ts', text: "other.push({ code: 'NOT_REGISTERED' });" },
      { file: 'c.ts', text: "const label = 'recorder.record({ code: \"NOPE\" })';" },
    ];

    expect(unregisteredCodesOf(files)).toEqual([]);
  });

  it(
    '★ 全仓现存的记录调用都用表内码',
    () => {
      const dirs = ['packages', 'scripts'];
      const scanned = dirs.flatMap((dir) => walk(join(REPO, dir))).map((file) => ({
        file: relative(REPO, file).split('\\').join('/'),
        text: readFileSync(file, 'utf8'),
      }));
      const files = scanned.filter((one) => RECORD_CALL.test(one.text));

      expect(scanned.length).toBeGreaterThan(100);
      expect(files.length).toBeGreaterThan(0);
      expect(unregisteredCodesOf(files)).toEqual([]);
    },
    60_000,
  );
});
