import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authHeaderOf } from '../npm-auth.js';

const dirs: string[] = [];

function withNpmrc(text: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-npm-auth-'));
  dirs.push(dir);
  const file = join(dir, '.npmrc');
  writeFileSync(file, text);
  vi.stubEnv('NPM_CONFIG_USERCONFIG', file);
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('私有源的 tarball HEAD 凭据', () => {
  it('★ 按 registry 的路径取 token，发 Bearer', () => {
    withNpmrc('//r.example/team/:_authToken=secret\n');
    expect(authHeaderOf('https://r.example/team/pkg/-/pkg-1.0.0.tgz')).toBe('Bearer secret');
  });

  it('★ token 外面那层引号不是值的一部分', () => {
    withNpmrc('//r.example/:_authToken="secret"\n');
    expect(authHeaderOf('https://r.example/pkg/-/pkg-1.0.0.tgz')).toBe('Bearer secret');
  });

  it('★ 值里的环境变量照 npm 的口径展开', () => {
    vi.stubEnv('DSH_WB_TEST_TOKEN', 'from-env');
    withNpmrc('//r.example/:_authToken=${DSH_WB_TEST_TOKEN}\n');
    expect(authHeaderOf('https://r.example/pkg/-/pkg-1.0.0.tgz')).toBe('Bearer from-env');
  });

  it('★ 路径更具体的那条优先', () => {
    withNpmrc('//r.example/:_authToken=root\n//r.example/team/:_authToken=team\n');
    expect(authHeaderOf('https://r.example/team/pkg/-/pkg-1.0.0.tgz')).toBe('Bearer team');
    expect(authHeaderOf('https://r.example/other/pkg/-/pkg-1.0.0.tgz')).toBe('Bearer root');
  });

  it('★ 路径只在整段对得上时才算：/team/ 不罩 /teamwork/', () => {
    withNpmrc('//r.example/team/:_authToken=team\n');
    expect(authHeaderOf('https://r.example/teamwork/pkg/-/pkg-1.0.0.tgz')).toBeUndefined();
  });

  it('主机名大小写不影响匹配', () => {
    withNpmrc('//R.Example/:_authToken=secret\n');
    expect(authHeaderOf('https://r.example/pkg/-/pkg-1.0.0.tgz')).toBe('Bearer secret');
  });

  it('别的源上的 token 不会跟着发过去', () => {
    withNpmrc('//r.example/:_authToken=secret\n');
    expect(authHeaderOf('https://other.example/pkg/-/pkg-1.0.0.tgz')).toBeUndefined();
  });

  it('_auth 与 username/_password 也能用', () => {
    withNpmrc('//a.example/:_auth=YWxpY2U6cGFzcw==\n//b.example/:username=alice\n//b.example/:_password=cGFzcw==\n');
    expect(authHeaderOf('https://a.example/pkg/-/pkg-1.0.0.tgz')).toBe('Basic YWxpY2U6cGFzcw==');
    expect(authHeaderOf('https://b.example/pkg/-/pkg-1.0.0.tgz')).toBe('Basic YWxpY2U6cGFzcw==');
  });

  it('没有 npmrc、地址不是 http(s) 时都不带凭据', () => {
    vi.stubEnv('NPM_CONFIG_USERCONFIG', join(tmpdir(), 'dsh-wb-missing-npmrc'));
    expect(authHeaderOf('https://r.example/pkg/-/pkg-1.0.0.tgz')).toBeUndefined();
    expect(authHeaderOf('not a url')).toBeUndefined();
    expect(authHeaderOf('file:///tmp/pkg.tgz')).toBeUndefined();
  });
});
