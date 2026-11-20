import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDeclaration } from '@dsh-workbench/shared/host';
import {
  DECLARED_TOOLS_FILE,
  declaredToolsApplies,
  declaredToolsPathOf,
  declaredToolsProblemOf,
  declaredToolsWithoutKey,
  renderDeclaredTools,
} from './declared-tools.mjs';
import { readDesign } from './design.mjs';
import {
  DATASOURCE_FILE,
  datasourceEntriesOf,
  datasourceProblemOf,
  renderDatasource,
} from './datasource-file.mjs';
import { SITES_FILE, renderSites, sitesEntriesOf, sitesProblemOf } from './sites-file.mjs';

export async function sync({ root }) {
  const manifestPath = join(root, 'package.json');
  if (!existsSync(manifestPath)) throw new Error(`${manifestPath} 不存在 —— sync 需要在模块包目录中运行`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const raw = manifest.dsh?.workbench;
  const unit = typeof raw?.unit === 'string' ? raw.unit : manifest.name;
  if (raw === undefined) throw new Error(`${unit}: package.json 中没有 dsh.workbench —— 该包不是模块包`);

  const read = readDeclaration(unit, raw);
  if (read.problems.length > 0) throw new Error(read.problems.join('；'));
  const sites = read.manifest?.host.sites;
  const siteEntries = sitesEntriesOf(sites);
  const tools = Array.isArray(raw.tools) ? raw.tools : [];
  const design = readDesign(root);
  const entries = datasourceEntriesOf(design, sites);
  const sitesAt = join(root, SITES_FILE);
  if (tools.length > 0) {
    const missing = declaredToolsWithoutKey(raw);
    if (missing.length > 0) {
      const hint = declaredToolsApplies(raw)
        ? '使用 key 就采用生成物方式，每个工具都必须有一个 key'
        : '为每个工具添加一个 lowerCamelCase 的 key，代码中不再写工具名的字面量';
      throw new Error(
        `${unit}: 清单里 ${missing.join(' / ')} 没有 key —— ${hint}。例如：\n` +
          `${tools.map((tool) => `  "key": "…",  // ${JSON.stringify(tool.name)}`).join('\n')}\n` +
          '（key 是代码中的短名称：`DECLARED_TOOLS.<key>.name`；生成物按清单生成它，代码引用工具名时写它，不要写字面量）',
      );
    }
  }

  if (siteEntries.length === 0 && existsSync(sitesAt)) {
    const current = readFileSync(sitesAt, 'utf8').trimStart();
    if (!current.startsWith('export const SITES = {')) {
      throw new Error(`${SITES_FILE} 不是生成物（开头不是 export const SITES）—— 请先手动处理，避免 sync 误删`);
    }
    rmSync(sitesAt, { force: true });
    console.log(`${unit}: 清单中没有站点表，已删除旧的 ${SITES_FILE}`);
  }

  if (tools.length === 0 && entries.length === 0 && siteEntries.length === 0) {
    console.log(`${unit}: 清单中没有工具与站点表，design.json 中也没有带 key 的配方，无需生成物`);
    return;
  }

  if (siteEntries.length > 0) {
    const had = existsSync(sitesAt);
    if (had) {
      const current = readFileSync(sitesAt, 'utf8').trimStart();
      if (!current.startsWith('export const SITES = {')) {
        throw new Error(`${SITES_FILE} 不是生成物（开头不是 export const SITES）—— 请先手动处理，避免 sync 覆盖`);
      }
    }
    const stale = sitesProblemOf(root, sites);
    writeFileSync(sitesAt, renderSites(sites));
    console.log(
      `${unit}: 已写入 ${SITES_FILE}（${siteEntries.length} 个站点，按清单生成）` +
        (had && stale !== undefined ? ' —— 原文件与清单不一致，已刷新' : ''),
    );
  }

  if (tools.length > 0) {
    const at = declaredToolsPathOf(root);
    const had = existsSync(at);
    const stale = declaredToolsProblemOf(root, raw);
    writeFileSync(at, renderDeclaredTools(raw));
    console.log(
      `${unit}: 已写入 ${DECLARED_TOOLS_FILE}（${tools.length} 个工具，按清单生成）` +
        (had && stale !== undefined ? ' —— 原文件与清单不一致，已刷新' : ''),
    );
  }

  if (entries.length > 0) {
    const at = join(root, DATASOURCE_FILE);
    const had = existsSync(at);
    const stale = datasourceProblemOf(root, design, sites);
    writeFileSync(at, renderDatasource(design, sites));
    console.log(
      `${unit}: 已写入 ${DATASOURCE_FILE}（${entries.length} 条配方，按 design.json 生成）` +
        (had && stale !== undefined ? ' —— 原文件与设计记录不一致，已刷新' : ''),
    );
  }
}
