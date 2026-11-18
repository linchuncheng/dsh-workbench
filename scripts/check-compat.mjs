import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const waiverAt = args.indexOf('--waiver');
const waiver = waiverAt === -1 ? '' : (args[waiverAt + 1] ?? '').trim();
const repo = process.env.GITHUB_REPOSITORY ?? '';
const repoArgs = repo === '' ? [] : ['--repo', repo];

if (waiverAt !== -1 && waiver === '') {
  console.error('✖ --waiver 需要理由：pnpm run check:compat -- --waiver "原因"');
  process.exit(1);
}

if ((process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '') === '') {
  console.error('✖ 没有 GH_TOKEN / GITHUB_TOKEN：兼容性检查必须 fail-closed');
  process.exit(1);
}

let issues;
try {
  issues = JSON.parse(
    execFileSync('gh', ['issue', 'list', ...repoArgs, '--label', 'compat', '--state', 'open', '--json', 'number,title,url'], {
      encoding: 'utf8',
    }),
  );
} catch (error) {
  console.error(`✖ 查不了 compat issue：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

if (issues.length === 0) {
  console.log('✅ 没有未解决的 compat issue');
  process.exit(0);
}

for (const issue of issues) console.error(`  #${issue.number} ${issue.title} ${issue.url}`);
if (waiver !== '') {
  console.warn(`⚠ 兼容性豁免：${waiver}`);
  process.exit(0);
}
console.error('✖ 有未解决的 compat issue；先跑 latest canary 并处理，或显式豁免');
process.exit(1);
