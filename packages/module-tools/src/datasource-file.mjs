import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { callsProblemOf, envelopePathOf, recipeProblemOf, resolveRecipeOf } from '@dsh-workbench/shared/host';

export const DATASOURCE_FILE = 'src/datasource.ts';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function readsOf(design) {
  const list = design?.reads;
  if (Array.isArray(list) && list.length > 0) return list;
  const one = design?.datasource;
  return one === undefined || one === null || typeof one !== 'object' ? [] : [one];
}

export function writesOf(design) {
  const list = design?.writes;
  if (Array.isArray(list) && list.length > 0) return list;
  const one = design?.write;
  return one === undefined || one === null || typeof one !== 'object' ? [] : [one];
}

function expandedResponseOf(response, envelope) {
  if (response === undefined) return response;
  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('response 要是对象');
  }
  if ((response.kind ?? 'json') !== 'json') return response;
  const got = envelopePathOf(response.path, envelope);
  if (!got.ok) throw new Error(got.problem);
  return { ...response, ...(got.path === undefined ? {} : { path: got.path }) };
}

function expandedCallsOf(calls, envelope) {
  if (calls === undefined || calls === null) return calls;
  return Object.fromEntries(
    Object.entries(calls).map(([name, call]) => {
      if (call?.response === undefined || call.response === null) return [name, call];
      if (typeof call.response !== 'object' || Array.isArray(call.response)) {
        throw new Error(`calls.${name}.response 要是对象`);
      }
      if (call.response.path === undefined) return [name, call];
      try {
        return [name, { ...call, response: expandedResponseOf(call.response, envelope) }];
      } catch (error) {
        throw new Error(`calls.${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    }),
  );
}

function resolvedRecipeOf(recipe, sites) {
  const got = resolveRecipeOf(recipe, sites);
  if (!got.ok) throw new Error(got.problem.message);
  const problem = recipeProblemOf(got.value);
  if (problem !== undefined) throw new Error(problem);
  const { site, envelope: ownEnvelope, ...rest } = got.value;
  const siteName = text(site);
  const siteEnvelope = siteName === '' ? undefined : sites?.[siteName]?.envelope;
  const envelope = ownEnvelope !== undefined ? ownEnvelope : siteEnvelope;
  const envelopePath = envelopePathOf(undefined, envelope);
  if (!envelopePath.ok) throw new Error(`envelope：${envelopePath.problem}`);
  const baseResponse =
    rest.response === undefined && envelopePath.path !== undefined
      ? { kind: 'json', path: envelopePath.path }
      : rest.response;
  return {
    ...rest,
    ...(baseResponse === undefined ? {} : { response: expandedResponseOf(baseResponse, envelope) }),
  };
}

export function datasourceEntriesOf(design, sites) {
  const entries = [
    ...readsOf(design).map((read) => ({ key: text(read?.key), recipe: read?.recipe, calls: read?.calls })),
    ...writesOf(design).map((write) => ({ key: text(write?.key), recipe: write?.recipe })),
  ]
    .filter((one) => one.key !== '' && one.recipe !== undefined && one.recipe !== null)
    .map((one) => {
      try {
        const recipe = resolvedRecipeOf(one.recipe, sites);
        if (one.calls !== undefined) {
          const callsProblem = callsProblemOf(recipe, one.calls);
          if (callsProblem !== undefined) throw new Error(callsProblem);
        }
        const siteName = text(one.recipe.site);
        const envelope =
          one.recipe.envelope !== undefined
            ? one.recipe.envelope
            : (siteName === '' ? undefined : sites?.[siteName]?.envelope);
        return { ...one, recipe, ...(one.calls === undefined ? {} : { calls: expandedCallsOf(one.calls, envelope) }) };
      } catch (error) {
        throw new Error(`${one.key}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    });
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.key)) throw new Error(`design.json 里 key 重复：${entry.key}（读与写、或两条读不能共用一个 key）`);
    seen.add(entry.key);
  }
  return entries;
}

function stringLiteral(value) {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}'`;
}

export function keyLiteral(key) {
  if (key === '__proto__') return "['__proto__']";
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : stringLiteral(key);
}

export function tsLiteral(value, indent) {
  if (typeof value === 'string') return stringLiteral(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map((one) => tsLiteral(one, indent + 1)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, one]) => one !== undefined);
    if (entries.length === 0) return '{}';
    const pad = '  '.repeat(indent + 1);
    const close = '  '.repeat(indent);
    return `{\n${entries
      .map(([key, one]) => `${pad}${keyLiteral(key)}: ${tsLiteral(one, indent + 1)},`)
      .join('\n')}\n${close}}`;
  }
  return 'null';
}

export function renderDatasource(design, sites) {
  const entries = datasourceEntriesOf(design, sites);
  const lines = ['export const DATASOURCE = {'];
  for (const entry of entries) {
    lines.push(`  ${keyLiteral(entry.key)}: ${tsLiteral(entry.recipe, 1)},`);
  }
  lines.push('} as const;');
  const batched = entries.filter((entry) => entry.calls !== undefined && entry.calls !== null);
  if (batched.length > 0) {
    lines.push('', 'export const DATASOURCE_CALLS = {');
    for (const entry of batched) {
      lines.push(`  ${keyLiteral(entry.key)}: ${tsLiteral(entry.calls, 1)},`);
    }
    lines.push('} as const;');
  }
  lines.push('');
  return lines.join('\n');
}

export function datasourceProblemOf(dir, design, sites) {
  const at = join(dir, DATASOURCE_FILE);
  let entries;
  let expected;
  try {
    entries = datasourceEntriesOf(design, sites);
    expected = renderDatasource(design, sites);
  } catch (error) {
    return `design.json 里的配方解析不了站点或信封：${error.message}`;
  }
  if (entries.length === 0) {
    if (!existsSync(at)) return undefined;
    return (
      `${DATASOURCE_FILE} 在，但 design.json 里没有 key + recipe 的读 / 写 —— ` +
      '补上配方（跑 `dsh-wb-module sync` 刷新），或者删掉这个生成物'
    );
  }
  if (!existsSync(at)) {
    return `${DATASOURCE_FILE} 不在 —— design.json 里有 key + recipe 的读 / 写，就该有生成物，跑 \`dsh-wb-module sync\``;
  }
  const strip = (source) => source.replace(/\s+/g, '').replace(/"/g, "'");
  const actual = strip(readFileSync(at, 'utf8'));
  if (actual !== strip(expected)) {
    const drifting = entries
      .filter((entry) => !actual.includes(strip(`  ${keyLiteral(entry.key)}: ${tsLiteral(entry.recipe, 1)},`)))
      .map((entry) => entry.key);
    return (
      `${DATASOURCE_FILE} 的 ${drifting.length === 0 ? '配方' : drifting.join(' / ')} 与 design.json 对不上` +
      '（生成物过期，或有人手改了它）—— 跑 `dsh-wb-module sync` 刷新。别手改：它是生成的'
    );
  }
  return undefined;
}
