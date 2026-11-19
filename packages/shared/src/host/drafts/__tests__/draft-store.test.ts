import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDraftStore, type DraftStore } from '../draft-store.js';

const roots: string[] = [];

function rootOf(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-wb-test-'));
  roots.push(root);
  return root;
}

function storeOf(maxBytes?: number): { store: DraftStore; root: string } {
  const root = rootOf();
  return {
    store: createDraftStore({
      root,
      ...(maxBytes === undefined ? {} : { maxBytes }),
    }),
    root,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('会话草稿库', () => {
  it('put 把正文落到临时目录，返回 id / path / 字节数 / sha256', () => {
    const { store, root } = storeOf();
    const put = store.put({
      session: 's-1',
      content: 'replicaCount: 2\n',
      label: 'diep-dify/tencent-test-values.yaml',
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    expect(put.id).toMatch(/^[0-9a-f]{24}$/);
    expect(put.path.startsWith(root)).toBe(true);
    expect(put.path.endsWith('-tencent-test-values.yaml')).toBe(true);
    expect(put.bytes).toBe(Buffer.byteLength('replicaCount: 2\n', 'utf8'));
    expect(put.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(put.path, 'utf8')).toBe('replicaCount: 2\n');
  });

  it('content 读回 agent 改过的那份，而不是 put 时缓存的那份', () => {
    const { store } = storeOf();
    const put = store.put({ session: 's-1', content: 'a: 1\n' });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    writeFileSync(put.path, 'a: 2\n', 'utf8');
    const read = store.content({ id: put.id, session: 's-1' });
    expect(read).toMatchObject({ ok: true, content: 'a: 2\n' });
  });

  it('pathOf 给提交用的真实路径，session 不对就拒绝', () => {
    const { store } = storeOf();
    const put = store.put({ session: 's-1', content: 'x' });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    expect(store.pathOf({ id: put.id, session: 's-1' })).toEqual({
      ok: true,
      path: put.path,
    });
    expect(store.pathOf({ id: put.id, session: 's-2' })).toMatchObject({
      ok: false,
      code: 'foreign',
    });
  });

  it('草稿只认自己发的 id：内容可以按 id 读，但换会话拿不到路径', () => {
    const { store } = storeOf();
    const put = store.put({ session: 's-1', content: 'x' });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    expect(store.content({ id: put.id })).toMatchObject({
      ok: true,
      content: 'x',
    });
    expect(store.content({ id: put.id, session: 's-2' })).toMatchObject({
      ok: false,
      code: 'foreign',
    });
  });

  it('不存在的 id 说失效，不猜路径', () => {
    const { store } = storeOf();
    expect(store.content({ id: 'nope', session: 's-1' })).toMatchObject({
      ok: false,
      code: 'missing',
    });
    expect(store.pathOf({ id: 'nope', session: 's-1' })).toMatchObject({
      ok: false,
      code: 'missing',
    });
  });

  it('没有会话 id 不建草稿', () => {
    const { store } = storeOf();
    expect(store.put({ session: '  ', content: 'x' })).toMatchObject({
      ok: false,
      code: 'no-session',
    });
  });

  it('二进制和超上限都拒绝', () => {
    const { store } = storeOf(8);
    expect(store.put({ session: 's-1', content: 'a\0b' })).toMatchObject({
      ok: false,
      code: 'binary',
    });
    expect(
      store.put({ session: 's-1', content: '0123456789' }),
    ).toMatchObject({ ok: false, code: 'too-large' });
  });

  it('空正文是合法的（mkfile 的空文件）', () => {
    const { store } = storeOf();
    const put = store.put({ session: 's-1', content: '', label: 'empty.yaml' });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    expect(put.bytes).toBe(0);
    expect(store.content({ id: put.id, session: 's-1' })).toMatchObject({
      ok: true,
      content: '',
    });
  });

  it('dispose 删掉整棵草稿目录，之后的 id 全失效', () => {
    const { store, root } = storeOf();
    const put = store.put({ session: 's-1', content: 'x' });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    store.dispose();
    expect(() => statSync(root)).toThrow();
    expect(store.content({ id: put.id, session: 's-1' })).toMatchObject({
      ok: false,
      code: 'missing',
    });
    expect(store.put({ session: 's-1', content: 'y' })).toMatchObject({
      ok: false,
      code: 'missing',
    });
  });
});
