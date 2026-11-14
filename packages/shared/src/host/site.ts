import type {
  DataErrorCode,
  RequestPlan,
  RequestRecipe,
  ResolvedRequestPlan,
  ResolvedRequestRecipe,
} from '../contract/data.js';
import type { SiteEnvelope, UnitSite } from '../contract/unit.js';
import { isRecord } from '../contract/guards.js';

export type UnitSites = Readonly<Record<string, UnitSite>>;

export interface SiteProblem {
  readonly code: DataErrorCode;
  readonly message: string;
  readonly pageCode: string;
}

export type SiteResolution<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: SiteProblem };

export interface PlanEnvelopeOptions {
  readonly envelope?: SiteEnvelope | false | undefined;
}

export type EnvelopePath =
  | { readonly ok: true; readonly path: string | undefined }
  | { readonly ok: false; readonly problem: string };

function siteUndeclaredOf(site: string, sites: UnitSites | undefined): SiteProblem {
  return {
    code: 'invalid-request',
    message:
      sites === undefined
        ? `模块清单没有站点表（host.sites），这条配方引用了站点 ${site}`
        : `站点 ${site} 没在清单 host.sites 里声明`,
    pageCode: 'site-undeclared',
  };
}

function siteOf(site: string | undefined, sites: UnitSites | undefined): SiteResolution<UnitSite | undefined> {
  if (site === undefined) return { ok: true, value: undefined };
  if (!isRecord(sites) || !Object.hasOwn(sites, site)) return { ok: false, problem: siteUndeclaredOf(site, sites) };
  const found = sites[site];
  if (!isRecord(found) || typeof found.origin !== 'string' || found.origin.trim() === '') {
    return {
      ok: false,
      problem: {
        code: 'invalid-request',
        message: `站点 ${site} 没有 origin —— 清单 host.sites.${site} 至少要写一个 http(s) origin`,
        pageCode: 'site-undeclared',
      },
    };
  }
  return { ok: true, value: found as UnitSite };
}

function emptyProblemOf(label: string): SiteProblem {
  return {
    code: 'invalid-request',
    message: `${label}要有 origin 或 site 至少一个`,
    pageCode: 'site-undeclared',
  };
}

/**
 * 把一条只写 `site`（或同时写 `origin`）的配方解析成带 `origin` 的直白形状。
 * 显式字段优先于站点默认值；`origin` 显式写时只覆盖站点的 origin。
 */
export function resolveRecipeOf(
  recipe: RequestRecipe,
  sites: UnitSites | undefined,
): SiteResolution<ResolvedRequestRecipe> {
  if (typeof recipe !== 'object' || recipe === null || Array.isArray(recipe)) {
    return { ok: false, problem: emptyProblemOf('配方') };
  }
  const originText = typeof recipe.origin === 'string' ? recipe.origin.trim() : '';
  const siteText = typeof recipe.site === 'string' ? recipe.site.trim() : '';
  const siteName = siteText === '' ? undefined : siteText;
  if (originText === '' && siteName === undefined) return { ok: false, problem: emptyProblemOf('配方') };
  const picked = siteOf(siteName, sites);
  if (!picked.ok) return picked;
  const site = picked.value;
  if (originText === '' && site === undefined) return { ok: false, problem: emptyProblemOf('配方') };
  const origin = originText === '' ? (site as UnitSite).origin : originText;
  return {
    ok: true,
    value: {
      ...recipe,
      origin,
      ...(recipe.loginUrl === undefined && site?.loginUrl !== undefined ? { loginUrl: site.loginUrl } : {}),
      ...(recipe.session === undefined && site?.session !== undefined ? { session: site.session } : {}),
      ...(recipe.timeoutMs === undefined && site?.timeoutMs !== undefined ? { timeoutMs: site.timeoutMs } : {}),
      ...(recipe.authLoss === undefined && site?.authLoss !== undefined ? { authLoss: site.authLoss } : {}),
    },
  };
}

/**
 * 把一份只写 `site`（或同时写 `origin`）的读取计划解析成带 `origin` 的直白形状。
 * 显式字段优先于站点默认值。
 */
export function resolvePlanOf(
  plan: RequestPlan,
  sites: UnitSites | undefined,
): SiteResolution<ResolvedRequestPlan> {
  if (typeof plan !== 'object' || plan === null || Array.isArray(plan)) {
    return { ok: false, problem: emptyProblemOf('计划') };
  }
  const originText = typeof plan.origin === 'string' ? plan.origin.trim() : '';
  const siteText = typeof plan.site === 'string' ? plan.site.trim() : '';
  const siteName = siteText === '' ? undefined : siteText;
  if (originText === '' && siteName === undefined) return { ok: false, problem: emptyProblemOf('计划') };
  const picked = siteOf(siteName, sites);
  if (!picked.ok) return picked;
  const site = picked.value;
  if (originText === '' && site === undefined) return { ok: false, problem: emptyProblemOf('计划') };
  const origin = originText === '' ? (site as UnitSite).origin : originText;
  return {
    ok: true,
    value: {
      ...plan,
      origin,
      ...(plan.loginUrl === undefined && site?.loginUrl !== undefined ? { loginUrl: site.loginUrl } : {}),
      ...(plan.session === undefined && site?.session !== undefined ? { session: site.session } : {}),
      ...(plan.timeoutMs === undefined && site?.timeoutMs !== undefined ? { timeoutMs: site.timeoutMs } : {}),
      ...(plan.authLoss === undefined && site?.authLoss !== undefined ? { authLoss: site.authLoss } : {}),
    },
  };
}

/**
 * 把相对信封 `dataPath` 的路径展开成绝对路径；`envelope: false` 表示从根取、不展开。
 * 多段 `dataPath`（如 `data.list`）不猜语义，要求调用方写全。
 */
export function envelopePathOf(path: string | undefined, envelope: SiteEnvelope | false | undefined): EnvelopePath {
  if (path !== undefined && typeof path !== 'string') {
    return { ok: false, problem: 'response.path 要是字符串' };
  }
  const rawPath = path?.trim() ?? '';
  const normalizedPath = rawPath === '' ? undefined : rawPath;
  if (rawPath !== '' && rawPath.split('.').some((segment) => segment.trim() === '')) {
    return { ok: false, problem: 'response.path 里不许有空段' };
  }
  if (envelope === undefined || envelope === false) return { ok: true, path: normalizedPath };
  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
    return { ok: false, problem: '信封要是对象或 false' };
  }
  if (envelope.dataPath !== undefined && typeof envelope.dataPath !== 'string') {
    return { ok: false, problem: '信封的 dataPath 要是字符串' };
  }
  const dataPath = envelope.dataPath?.trim();
  if (dataPath !== undefined && dataPath.split('.').some((segment) => segment.trim() === '')) {
    return { ok: false, problem: '信封的 dataPath 里不许有空段' };
  }
  if (dataPath === undefined || dataPath === '') return { ok: true, path: normalizedPath };
  const current = rawPath;
  if (current === '') return { ok: true, path: dataPath };
  const under = current === dataPath || current.startsWith(`${dataPath}.`);
  if (!under && dataPath.includes('.')) {
    return {
      ok: false,
      problem: `站点信封的 dataPath 有多段（${dataPath}），配方路径要写全（以 ${dataPath} 开头）`,
    };
  }
  const next = under ? current : `${dataPath}.${current}`;
  const doubled = `${dataPath}.${dataPath}`;
  if (next === doubled || next.startsWith(`${doubled}.`)) {
    return { ok: false, problem: `路径出现重复前缀 ${doubled}` };
  }
  return { ok: true, path: next };
}

function expandedStepOf(step: RequestPlan['steps'][number], envelope: SiteEnvelope | false | undefined) {
  if (typeof step !== 'object' || step === null || Array.isArray(step)) throw new Error('计划里的步骤要是对象');
  const next = { ...step };
  if (step.response === undefined || step.response === null) {
    delete next.response;
  } else if ((step.response.kind ?? 'json') === 'json') {
    const got = envelopePathOf(step.response.path, envelope);
    if (!got.ok) throw new Error(got.problem);
    next.response = { ...step.response, ...(got.path === undefined ? {} : { path: got.path }) };
  }
  if (step.while === undefined || step.while === null) {
    delete next.while;
  } else {
    const got = envelopePathOf(step.while.path, envelope);
    if (!got.ok) throw new Error(got.problem);
    next.while = { ...step.while, path: got.path ?? step.while.path };
  }
  return next;
}

/**
 * 手写计划的信封展开：吃一份计划与站点，返回 `response.path` / `while.path` 已展开的计划。
 * 运行时不认识信封；要用这份 helper 在代码里显式展开。
 */
export function expandPlanPathsOf(
  plan: RequestPlan,
  site: UnitSite,
  options: PlanEnvelopeOptions = {},
): RequestPlan {
  if (typeof plan !== 'object' || plan === null || !Array.isArray(plan.steps)) {
    throw new Error('计划要是对象且带 steps');
  }
  if (typeof site !== 'object' || site === null) throw new Error('站点要是对象');
  const envelope = options.envelope === undefined ? site.envelope : options.envelope;
  if (envelope === undefined || envelope === false) return plan;
  return { ...plan, steps: plan.steps.map((step) => expandedStepOf(step, envelope)) };
}
