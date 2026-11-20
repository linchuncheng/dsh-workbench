import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { keyLiteral, tsLiteral } from './datasource-file.mjs';

export const SITES_FILE = 'src/sites.ts';

export function sitesEntriesOf(sites) {
  return Object.entries(sites ?? {}).filter(([, site]) => site !== undefined && site !== null);
}

export function renderSites(sites) {
  const entries = sitesEntriesOf(sites);
  const lines = ['export const SITES = {'];
  for (const [name, site] of entries) {
    lines.push(`  ${keyLiteral(name)}: ${tsLiteral(site, 1)},`);
  }
  lines.push('} as const;', '', 'export type SiteName = keyof typeof SITES;', '');
  return lines.join('\n');
}

export function sitesProblemOf(dir, sites) {
  const at = join(dir, SITES_FILE);
  const entries = sitesEntriesOf(sites);
  if (entries.length === 0) {
    if (!existsSync(at)) return undefined;
    return `${SITES_FILE} 存在，但清单 dsh.workbench.host.sites 中没有站点 —— 请补回清单，或删除该生成物`;
  }
  if (!existsSync(at)) {
    return `${SITES_FILE} 不存在 —— 清单中有站点表，就应有生成物，请运行 \`dsh-wb-module sync\``;
  }
  const strip = (source) => source.replace(/\s+/g, '').replace(/"/g, "'");
  if (strip(readFileSync(at, 'utf8')) !== strip(renderSites(sites))) {
    return `${SITES_FILE} 与清单的站点表对不上（生成物过期，或有人手动修改过）—— 请运行 \`dsh-wb-module sync\` 刷新`;
  }
  return undefined;
}
