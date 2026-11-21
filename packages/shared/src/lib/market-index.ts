import type { MarketIndexSource, MarketLocalizedText } from '../contract/protocol/market-index.js';

const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function marketBranchOk(value: string): boolean {
  const branch = value.trim();
  return (
    BRANCH.test(branch) &&
    !branch.includes('..') &&
    !branch.endsWith('/') &&
    !branch.endsWith('.') &&
    !branch.includes('@{')
  );
}

export function marketText(value: MarketLocalizedText | undefined, locale: string): string {
  if (value === undefined) return '';
  const zh = value.zh ?? '';
  const en = value.en ?? '';
  return locale.toLowerCase().startsWith('zh') ? zh || en : en || zh;
}

export function marketInstallTarget(
  name: string,
  version: string,
  source: MarketIndexSource,
): { readonly spec: string; readonly registry?: string } {
  if (source.type === 'npm') {
    const registry = (source.registry ?? '').trim();
    return { spec: `${name}@${version}`, ...(registry === '' ? {} : { registry }) };
  }
  const base = `git+${source.url.trim().replace(/^git\+/, '')}#${source.commit}`;
  const path = (source.path ?? '').trim().replace(/^\/+/, '');
  return { spec: path === '' ? base : `${base}&path:/${path}` };
}

export function marketSpecPath(spec: string): string | undefined {
  const at = spec.indexOf('&path:');
  if (at === -1) return undefined;
  const path = spec.slice(at + '&path:'.length).trim().replace(/^\/+/u, '').replace(/\/+$/u, '');
  return path === '' ? undefined : path;
}

export function marketSpecPackage(spec: string): string | undefined {
  const path = marketSpecPath(spec);
  if (path === undefined) return undefined;
  const parts = path.split('/').filter((part) => part !== '');
  const last = parts[parts.length - 1];
  if (last === undefined) return undefined;
  const parent = parts[parts.length - 2];
  return parent !== undefined && parent.startsWith('@') ? `${parent}/${last}` : last;
}

