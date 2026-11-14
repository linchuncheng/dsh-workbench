import type { SiteEnvelope, UnitSite } from './unit.js';
import { isRecord, listOf, outsideKeys, pathSegmentsProblem, text } from './guards.js';

const SITE_KEYS = ['origin', 'loginUrl', 'session', 'timeoutMs', 'authLoss', 'envelope', 'pagination'] as const;
const AUTH_LOSS_KEYS = ['path', 'equals', 'in', 'messagePath'] as const;
const ENVELOPE_KEYS = ['dataPath', 'codePath', 'messagePath'] as const;
const PAGINATION_KEYS = ['pageParam', 'sizeParam', 'totalPath'] as const;
const SITE_KEY_SHAPE = /^[a-z][a-z0-9-]*$/;
const SITE_TIMEOUT_MIN_MS = 1_000;
const SITE_TIMEOUT_MAX_MS = 120_000;

export function originProblemsOf(subject: string, value: readonly string[]): string[] {
  const problems: string[] = [];
  for (const one of value) {
    let url: URL;
    try {
      url = new URL(one);
    } catch {
      problems.push(`${subject}: ${JSON.stringify(one)} 不是合法 URL`);
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      problems.push(`${subject}: ${JSON.stringify(one)} 只能是 http / https`);
    } else if (url.username !== '' || url.password !== '') {
      problems.push(`${subject}: ${JSON.stringify(one)} 不要带用户名 / 密码`);
    } else if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
      problems.push(`${subject}: ${JSON.stringify(one)} 只能是站点根（不要带 path / query / hash）`);
    }
  }
  return problems;
}

function absoluteUrlProblemsOf(at: string, value: unknown): string[] {
  if (value === undefined) return [];
  const raw = text(value);
  if (raw === '') return [`${at} 不能为空`];
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return [`${at} 只认 http(s)`];
  } catch {
    return [`${at} 不是合法地址：${raw}`];
  }
  return [];
}

function unknownKeyProblemsOf(
  at: string,
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): string[] {
  const unknown = outsideKeys(value, allowed);
  return unknown.length === 0 ? [] : [`${at} 里有不认的键 ${listOf(unknown)} —— 只有 ${listOf(allowed)}`];
}

function primitiveValue(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function authLossProblemsOf(at: string, value: unknown): string[] {
  if (!isRecord(value)) return [`${at} 要是对象`];
  const problems = unknownKeyProblemsOf(at, value, AUTH_LOSS_KEYS);
  if (text(value.path) === '') problems.push(`${at}.path 不能为空`);
  const pathProblem = pathSegmentsProblem(value.path, `${at}.path`);
  if (pathProblem !== undefined) problems.push(pathProblem);
  const hasEquals = value.equals !== undefined;
  if (hasEquals && !primitiveValue(value.equals)) {
    problems.push(`${at}.equals 只支持字符串 / 数字 / 布尔 / null`);
  }
  if (value.in !== undefined && !Array.isArray(value.in)) problems.push(`${at}.in 要是数组`);
  if (Array.isArray(value.in) && value.in.some((one) => !primitiveValue(one))) {
    problems.push(`${at}.in 的元素只支持字符串 / 数字 / 布尔 / null`);
  }
  const hasIn = Array.isArray(value.in) && value.in.length > 0;
  if (!hasEquals && !hasIn) problems.push(`${at} 的 equals 或 in 至少给一个`);
  if (hasEquals && hasIn) problems.push(`${at} 的 equals 与 in 只给一个`);
  if (value.messagePath !== undefined && text(value.messagePath) === '') {
    problems.push(`${at}.messagePath 不能为空`);
  }
  const messageProblem = pathSegmentsProblem(value.messagePath, `${at}.messagePath`);
  if (messageProblem !== undefined) problems.push(messageProblem);
  return problems;
}

function envelopeProblemsOf(at: string, value: unknown): string[] {
  if (!isRecord(value)) return [`${at} 要是对象`];
  const problems = unknownKeyProblemsOf(at, value, ENVELOPE_KEYS);
  for (const key of ENVELOPE_KEYS) {
    if (value[key] !== undefined && text(value[key]) === '') problems.push(`${at}.${key} 不能为空`);
    const pathProblem = pathSegmentsProblem(value[key], `${at}.${key}`);
    if (pathProblem !== undefined) problems.push(pathProblem);
  }
  return problems;
}

function paginationProblemsOf(at: string, value: unknown): string[] {
  if (!isRecord(value)) return [`${at} 要是对象`];
  const problems = unknownKeyProblemsOf(at, value, PAGINATION_KEYS);
  for (const key of PAGINATION_KEYS) {
    if (value[key] !== undefined && text(value[key]) === '') problems.push(`${at}.${key} 不能为空`);
  }
  const pathProblem = pathSegmentsProblem(value.totalPath, `${at}.totalPath`);
  if (pathProblem !== undefined) problems.push(pathProblem);
  return problems;
}

function siteProblemsOf(at: string, value: unknown): string[] {
  if (!isRecord(value)) return [`${at} 要是对象`];
  const problems = unknownKeyProblemsOf(at, value, SITE_KEYS);
  const origin = text(value.origin);
  if (origin === '') problems.push(`${at}.origin 没写 —— 站点至少要有一个 http(s) origin`);
  else problems.push(...originProblemsOf(`${at}.origin`, [origin]));
  problems.push(...absoluteUrlProblemsOf(`${at}.loginUrl`, value.loginUrl));
  if (value.session !== undefined && text(value.session) === '') problems.push(`${at}.session 不能为空`);
  if (value.timeoutMs !== undefined) {
    const timeout = value.timeoutMs;
    if (
      typeof timeout !== 'number' ||
      !Number.isInteger(timeout) ||
      timeout < SITE_TIMEOUT_MIN_MS ||
      timeout > SITE_TIMEOUT_MAX_MS
    ) {
      problems.push(`${at}.timeoutMs 要在 ${String(SITE_TIMEOUT_MIN_MS)}..${String(SITE_TIMEOUT_MAX_MS)} 之间`);
    }
  }
  if (value.authLoss !== undefined) problems.push(...authLossProblemsOf(`${at}.authLoss`, value.authLoss));
  if (value.envelope !== undefined) problems.push(...envelopeProblemsOf(`${at}.envelope`, value.envelope));
  if (value.pagination !== undefined) {
    problems.push(...paginationProblemsOf(`${at}.pagination`, value.pagination));
  }
  return problems;
}

export function sitesProblemsOf(at: string, value: unknown): string[] {
  if (!isRecord(value)) return [`${at} 要是对象（短名 → 站点）`];
  const problems: string[] = [];
  for (const [name, site] of Object.entries(value)) {
    const one = `${at}.${name}`;
    if (!SITE_KEY_SHAPE.test(name)) {
      problems.push(
        `${one}: 站点名要是小写短名（字母开头，只含小写字母 / 数字 / 连字符），现在是 ${JSON.stringify(name)}`,
      );
    }
    problems.push(...siteProblemsOf(one, site));
  }
  return problems;
}

function envelopeOf(value: SiteEnvelope): SiteEnvelope {
  return {
    ...(value.dataPath === undefined ? {} : { dataPath: value.dataPath.trim() }),
    ...(value.codePath === undefined ? {} : { codePath: value.codePath.trim() }),
    ...(value.messagePath === undefined ? {} : { messagePath: value.messagePath.trim() }),
  };
}

function paginationOf(value: NonNullable<UnitSite['pagination']>): NonNullable<UnitSite['pagination']> {
  return {
    ...(value.pageParam === undefined ? {} : { pageParam: value.pageParam.trim() }),
    ...(value.sizeParam === undefined ? {} : { sizeParam: value.sizeParam.trim() }),
    ...(value.totalPath === undefined ? {} : { totalPath: value.totalPath.trim() }),
  };
}

export function siteOf(site: UnitSite): UnitSite {
  const authLoss = site.authLoss;
  return {
    origin: new URL(site.origin).origin,
    ...(site.loginUrl === undefined ? {} : { loginUrl: site.loginUrl.trim() }),
    ...(site.session === undefined ? {} : { session: site.session.trim() }),
    ...(site.timeoutMs === undefined ? {} : { timeoutMs: site.timeoutMs }),
    ...(authLoss === undefined
      ? {}
      : {
          authLoss: {
            path: authLoss.path.trim(),
            ...(authLoss.equals === undefined ? {} : { equals: authLoss.equals }),
            ...(authLoss.in === undefined || !Array.isArray(authLoss.in) ? {} : { in: [...authLoss.in] }),
            ...(authLoss.messagePath === undefined ? {} : { messagePath: authLoss.messagePath.trim() }),
          },
        }),
    ...(site.envelope === undefined ? {} : { envelope: envelopeOf(site.envelope) }),
    ...(site.pagination === undefined ? {} : { pagination: paginationOf(site.pagination) }),
  };
}
