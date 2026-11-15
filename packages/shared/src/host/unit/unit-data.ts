import type {
  CallOverrides,
  DataCallOptions,
  DataFailure,
  DataReader,
  DataRequest,
  PlanResults,
  RecipeCalls,
  RecipeResults,
  RequestPlan,
  RequestRecipe,
  SubmitPlanOptions,
} from '../../contract/data.js';
import { allSame } from '../data/plan-results.js';
import { resolvePlanOf, resolveRecipeOf, type SiteProblem, type UnitSites } from '../data/site.js';

function denied(origin: string, write = false): DataFailure {
  return {
    ok: false,
    error: {
      code: 'invalid-request',
      message: write
        ? `这个模块没声明写 ${origin}：在清单 host.origins 里加上它`
        : `这个模块没声明读 ${origin}：在清单 host.origins 里加上它`,
      pageCode: 'origin-not-declared',
    },
  };
}

function unreadable(origin: string): DataFailure {
  return {
    ok: false,
    error: {
      code: 'invalid-request',
      message: `读不了 ${origin}：它不是一个能解析的地址（要带 http / https）`,
      pageCode: 'origin-invalid',
    },
  };
}

function unresolved(problem: SiteProblem): DataFailure {
  return {
    ok: false,
    error: { code: problem.code, message: problem.message, pageCode: problem.pageCode },
  };
}

function failuresOf<T = unknown>(calls: RecipeCalls, error: DataFailure['error']): RecipeResults<T> {
  const names = calls !== null && typeof calls === 'object' ? Object.keys(calls) : [];
  return Object.fromEntries(names.map((name) => [name, { ok: false as const, error }])) as RecipeResults<T>;
}

function planDenied(plan: RequestPlan, origin: string, write = false): PlanResults {
  const error = originOfValue(origin) === undefined ? unreadable(origin).error : denied(origin, write).error;
  return allSame(plan, error);
}

function originOfValue(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function scopedDataReader(
  data: DataReader,
  origins: readonly string[] | undefined,
  sites?: UnitSites,
): DataReader {
  if (origins === undefined && sites === undefined) return data;
  const originOf = originOfValue;
  const siteOrigins =
    sites === undefined
      ? []
      : Object.values(sites).flatMap((site) =>
          typeof site?.origin === 'string' && site.origin.trim() !== '' ? [site.origin] : [],
        );
  const declared = origins === undefined ? (siteOrigins.length === 0 ? undefined : siteOrigins) : origins;
  const allowed =
    declared === undefined ? undefined : new Set(declared.map(originOf).filter((one): one is string => one !== undefined));
  const allows = (value: string): boolean => {
    const origin = originOf(value);
    return origin !== undefined && (allowed === undefined || allowed.has(origin));
  };
  const denyOf = (value: string, write = false): DataFailure =>
    originOf(value) === undefined ? unreadable(value) : denied(value, write);
  const shapedPlan = (plan: RequestPlan): string | undefined =>
    typeof plan === 'object' && plan !== null && Array.isArray(plan.steps) ? undefined : '计划要是对象且带 steps';
  const planInputOf = (
    plan: RequestPlan,
    write: boolean,
  ): { readonly plan: RequestPlan } | { readonly failure: PlanResults } => {
    const bad = shapedPlan(plan);
    if (bad !== undefined) return { failure: allSame(plan, { code: 'invalid-request', message: bad }) };
    const resolved = resolvePlanOf(plan, sites);
    if (!resolved.ok) return { failure: allSame(plan, unresolved(resolved.problem).error) };
    if (!allows(resolved.value.origin)) return { failure: planDenied(plan, resolved.value.origin, write) };
    return { plan: resolved.value };
  };
  const scoped: DataReader = {
    read: <T = unknown>(request: DataRequest, options?: DataCallOptions) => {
      if (typeof request !== 'object' || request === null) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'invalid-request' as const, message: '请求要是对象' },
        });
      }
      const raw = request.kind === 'http' ? request.url : request.kind === 'browser' ? request.url : undefined;
      const target = raw === undefined || raw === '' ? undefined : raw;
      if (target !== undefined && !allows(target)) return Promise.resolve(denyOf(target));
      return data.read<T>(request, options);
    },
    request: <T = unknown>(recipe: RequestRecipe, overrides?: CallOverrides, options?: DataCallOptions) => {
      const resolved = resolveRecipeOf(recipe, sites);
      if (!resolved.ok) return Promise.resolve(unresolved(resolved.problem));
      if (!allows(resolved.value.origin)) return Promise.resolve(denyOf(resolved.value.origin));
      return data.request<T>(resolved.value, overrides, options);
    },
    requestMany: <T = unknown>(recipe: RequestRecipe, calls: RecipeCalls, options?: DataCallOptions) => {
      const resolved = resolveRecipeOf(recipe, sites);
      if (!resolved.ok) {
        return Promise.resolve(failuresOf(calls, unresolved(resolved.problem).error));
      }
      if (!allows(resolved.value.origin)) {
        return Promise.resolve(failuresOf(calls, denyOf(resolved.value.origin).error));
      }
      return data.requestMany<T>(resolved.value, calls, options);
    },
    plan: (plan: RequestPlan, options?: DataCallOptions) => {
      const input = planInputOf(plan, false);
      if ('failure' in input) return Promise.resolve(input.failure);
      return data.plan(input.plan, options);
    },
    submit: <T = unknown>(recipe: RequestRecipe, overrides?: CallOverrides, options?: DataCallOptions) => {
      const resolved = resolveRecipeOf(recipe, sites);
      if (!resolved.ok) return Promise.resolve(unresolved(resolved.problem));
      if (!allows(resolved.value.origin)) return Promise.resolve(denyOf(resolved.value.origin, true));
      return data.submit<T>(resolved.value, overrides, options);
    },
    submitPlan: (plan: RequestPlan, options: SubmitPlanOptions) => {
      const input = planInputOf(plan, true);
      if ('failure' in input) return Promise.resolve(input.failure);
      return data.submitPlan(input.plan, options);
    },
  };
  return scoped;
}
