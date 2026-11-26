import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pkg, REPO } from '../lib.mjs';

const ENTRY = join(pkg('skills/workbench-module-diy'), 'SKILL.md');
const TITLE = '★ DIY skill 入口只放路由：不放代码块、参数、命令、路径这些细节';

const RULES = [
  ['代码块', /```/g],
  ['查询/参数语法', /(?:^|[\s（(])(?:name|scope|destination|done|unit|private|read|changelogNote|labels)\s*[:=]/g],
  ['命令行参数', /--[a-z]/g],
  ['命令', /(?:^|[\s（(])(?:pnpm|npx|node|dsh-wb-module)(?=[\s（(]|$)/g],
  ['安装路径', /node_modules|@dsh-workbench\//g],
  ['发布字段', /(?:needsUser|changelogNote|labels)/g],
];

export function violationsOf(text, { skipFrontmatter = false } = {}) {
  const found = [];
  const frontmatterEnd =
    skipFrontmatter && text.startsWith('---') ? text.indexOf('\n---', 3) : -1;
  for (const [label, pattern] of RULES) {
    for (const match of text.matchAll(pattern)) {
      if (frontmatterEnd !== -1 && match.index < frontmatterEnd) continue;
      const line = text.slice(0, match.index).split('\n').length;
      found.push(`${label}「${match[0]}」在第 ${line} 行`);
    }
  }
  return [...new Set(found)];
}

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const text = existsSync(ENTRY) ? readFileSync(ENTRY, 'utf8') : '';
      const bad = violationsOf(text, { skipFrontmatter: true });
      const dirty = violationsOf(
        '```bash\npnpm exec dsh-wb-module init demo --template diy\n```\nname=Card；unit=…；read=<地址>；private: true；node_modules/@dsh-workbench/core。',
      );
      const clean = violationsOf('用 `workbench_diy_plan` 开流程，细节见 [FAMILY.md](FAMILY.md)。');
      const selfTest = dirty.length >= 4 && clean.length === 0;
      report(
        TITLE,
        bad.length === 0 && selfTest,
        bad.length === 0 ? '入口只有路由 · 负例齐 / 正例干净' : `${relative(REPO, ENTRY)}：${bad.slice(0, 6).join('；')}${bad.length > 6 ? ' …' : ''}`,
      );
    },
  },
];
