import { execaSync } from 'execa';

const args = process.argv.slice(2);
const waiverAt = args.indexOf('--waiver');
const waiver = waiverAt === -1 ? '' : (args[waiverAt + 1] ?? '').trim();
const repo = process.env.GITHUB_REPOSITORY ?? '';
const repoArgs = repo === '' ? [] : ['--repo', repo];

if (waiverAt !== -1 && waiver === '') {
  console.error('✖ --waiver 需要理由：pnpm run check:compat -- --waiver "原因"');
  process.exit(1);
}

function failClosed(detail) {
  console.error('✖ 拿不到 GitHub 凭据：兼容性检查必须 fail-closed');
  console.error(`   ${detail}`);
  process.exit(1);
}

function cliToken() {
  try {
    const result = execaSync('gh', ['auth', 'token'], { encoding: 'utf8', reject: false });
    return result.exitCode === 0 ? result.stdout.trim() : '';
  } catch {
    return '';
  }
}

function ghRuns() {
  try {
    const result = execaSync('gh', ['--version'], { stdio: 'ignore', reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function loginThenToken() {
  if (!ghRuns()) {
    failClosed('找不到 gh：先安装 GitHub CLI，或 export GH_TOKEN=<token>');
  }
  if (!process.stdin.isTTY) {
    failClosed('这个终端不能交互登录：先 gh auth login，或 export GH_TOKEN=<token>，再重新运行');
  }
  console.log('⚠️  gh 未登录，启动登录流程…\n');
  try {
    const result = execaSync('gh', ['auth', 'login'], { stdio: 'inherit', reject: false });
    if ((result.exitCode ?? 1) !== 0) failClosed('gh 登录失败');
  } catch (error) {
    failClosed(`gh auth login 执行失败：${error instanceof Error ? error.message : String(error)}`);
  }
  return cliToken();
}

const token =
  (process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '').trim() || cliToken() || loginThenToken();

if (token === '') {
  failClosed('gh auth login 成功了，但 gh auth token 仍然取不到：改用 export GH_TOKEN=<token>');
}

let issues;
try {
  const result = execaSync(
    'gh',
    ['issue', 'list', ...repoArgs, '--label', 'compat', '--state', 'open', '--json', 'number,title,url'],
    { encoding: 'utf8', env: { GH_TOKEN: token } },
  );
  issues = JSON.parse(result.stdout);
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
