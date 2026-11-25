import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { PKG, REPO, pkg, read } from '../lib.mjs';

const LOCK = join(REPO, 'scripts', 'opencli-extension.lock.json');
const ADAPTER = join(REPO, 'packages', 'adapter-runtime');
const VENDOR = join(ADAPTER, 'vendor', 'browser-extension');
const TITLE_OWNER = '★ 浏览器扩展副本只在适配器包里（core 包的 files 不带 vendor）';
const TITLE_FILES = '★ 随包副本与扩展 lock 的文件清单逐一对上（清单独立生成，不取自副本自身）';
const TITLE_GIT = '★ 随包副本的每个文件都在 git 里（缺 dist/ 说明仓库比打包少文件）';

function digestOf(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function filesUnder(dir, prefix = '') {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...filesUnder(join(dir, entry.name), rel));
    else if (entry.isFile()) found.push(rel);
  }
  return found;
}

function vendorDirs() {
  const found = [];
  for (const name of readdirSync(join(REPO, 'packages'), { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const dir = join(REPO, 'packages', name.name, 'vendor', 'browser-extension');
    if (existsSync(join(dir, 'manifest.json'))) found.push(name.name);
  }
  return found;
}

function filesOfManifest(manifest) {
  const listed = manifest.files;
  return Array.isArray(listed) ? listed.filter((one) => typeof one === 'string') : [];
}

function tracked() {
  const text = execFileSync('git', ['ls-files', '--', relative(REPO, VENDOR)], { cwd: REPO, encoding: 'utf8' });
  return new Set(text.split('\n').filter((one) => one.trim() !== '').map((one) => one.trim()));
}

const RUNTIME_WORDS = /opencli/i;

export const checks = [

  {
    title: TITLE_OWNER,
    run(_ctx, report) {
      const owners = vendorDirs();
      const core = JSON.parse(read(join(PKG, 'package.json')));
      const adapter = JSON.parse(read(join(ADAPTER, 'package.json')));
      const problems = [];
      if (owners.join(',') !== 'adapter-runtime') problems.push(`副本在：${owners.join('、') || '（哪都没有）'}`);
      if (filesOfManifest(core).includes('vendor')) problems.push('core 的 files 还带着 vendor');
      if (!filesOfManifest(adapter).includes('vendor')) problems.push('adapter-runtime 的 files 没带 vendor');
      report(TITLE_OWNER, problems.length === 0, problems.join('；'));
    },
  },
  {
    title: TITLE_FILES,
    run(_ctx, report) {
      const lock = JSON.parse(read(LOCK));
      const expected = lock.files ?? {};
      const problems = [];
      for (const [rel, digest] of Object.entries(expected)) {
        const file = join(VENDOR, rel);
        if (!existsSync(file)) {
          problems.push(`缺 ${rel}`);
          continue;
        }
        if (digestOf(file) !== digest) problems.push(`${rel} 的 sha256 和 lock 对不上`);
      }
      if (Object.keys(expected).length === 0) problems.push('lock 里没有逐文件清单（跑同步脚本）');
      const known = new Set(Object.keys(expected));
      for (const rel of filesUnder(VENDOR)) if (!known.has(rel)) problems.push(`多出 ${rel}`);
      report(TITLE_FILES, problems.length === 0, problems.slice(0, 5).join('、'));
    },
  },
  {
    title: TITLE_GIT,
    run(_ctx, report) {
      const lock = JSON.parse(read(LOCK));
      const expected = Object.keys(lock.files ?? {});
      const known = tracked();
      const missing = expected.filter((rel) => !known.has(join(relative(REPO, VENDOR), rel).split('\\').join('/')));
      report(TITLE_GIT, missing.length === 0, missing.slice(0, 5).join('、'));
    },
  },

  {
    title: '★ 随包的启动 / 安装脚本不点名运行时（文案与入口都跟着适配器走）',
    run(_ctx, report) {
      const dirs = [pkg('bin'), pkg('scripts')];
      const hits = [];
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) {
            walk(path);
            continue;
          }
          if (path.includes('/selfcheck/')) continue;
          const source = read(path);
          if (!RUNTIME_WORDS.test(source)) continue;
          const line = source.split('\n').findIndex((one) => RUNTIME_WORDS.test(one)) + 1;
          hits.push(`${relative(PKG, path)}:${String(line)}`);
        }
      };
      for (const dir of dirs) walk(dir);
      report(
        '★ 随包的启动 / 安装脚本不点名运行时（文案与入口都跟着适配器走）',
        hits.length === 0,
        hits.length === 0 ? '0 处' : hits.slice(0, 5).join('、'),
      );
    },
  },
  {
    title:
      '★ 随包脚本不靠 x 位（pnpm publish 只给 bin 字段那条 755；直接执行 = 别人机器上 Permission denied）',
    run(ctx, report) {
      const launcher = read(pkg('bin/dsh-workbench'));
      const seedViaBash = launcher.includes('bash "$REPO_DIR/scripts/seed-profile.sh"');
      const noDirectSeed = !/^\s*"\$REPO_DIR\/scripts\/seed-profile\.sh"/m.test(launcher);
      const passed = seedViaBash && noDirectSeed;
      report(
        '★ 随包脚本不靠 x 位（pnpm publish 只给 bin 字段那条 755；直接执行 = 别人机器上 Permission denied）',
        passed,
        passed
          ? 'seed-profile.sh 经 bash 呼；运行时的隔离包装不归启动器写（随适配器出货、由宿主自举落盘）'
          : '有随包脚本是按可执行位调用的',
      );
    },
  },
  {
    title:
      '★ 装了 ≠ 选中：启动器拒启并给修复命令；setup 的"确保选中"幂等补回（否则只有一台没入口的实例）',
    run(ctx, report) {
      const launcherPath = pkg('bin/dsh-workbench');
      const seedPath = pkg('scripts/seed-profile.sh');
      const launcherText = read(launcherPath);
      const addAt = launcherText.indexOf('dsh plugin --profile "$PROFILE" add');
      const ensureAt = launcherText.indexOf('seed-profile.sh" ensure-selected');
      let probe;
      try {
        probe = execFileSync(
          'bash',
          [
            '-c',
            `
set -e
fresh="$(mktemp -d)"
trap 'rm -rf "$fresh"' EXIT
mkdir -p "$fresh/bin" "$fresh/profiles/workbench"
cat > "$fresh/bin/dsh" <<'SH'
#!/bin/sh
exit 0
SH
chmod +x "$fresh/bin/dsh"

cat > "$fresh/profiles/workbench/package.json" <<'JSON'
{"dependencies":{"@dsh-workbench/core":"link:/dev/null"},"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base"]}}}
JSON

if refusal="$(PATH="$fresh/bin:$PATH" DSH_HOME="$fresh" WORKBENCH_PROFILE=workbench bash "$1" 2>&1)"; then
  echo "launcher did not refuse: $refusal"; exit 0
fi
case "$refusal" in *dsh.profile.bundles*) ;; *) echo "no bundles reason: $refusal"; exit 0;; esac
case "$refusal" in *setup*) ;; *) echo "no repair command: $refusal"; exit 0;; esac

DSH_HOME="$fresh" bash "$2" ensure-selected >/dev/null
node -e 'const m=require(process.argv[1]); if(!m.dsh.profile.bundles.includes("@dsh-workbench/core")) process.exit(1)' "$fresh/profiles/workbench/package.json"
cp "$fresh/profiles/workbench/package.json" "$fresh/before.json"
DSH_HOME="$fresh" bash "$2" ensure-selected >/dev/null
cmp -s "$fresh/before.json" "$fresh/profiles/workbench/package.json"

cat > "$fresh/profiles/workbench/package.json" <<'JSON'
{"dependencies":{},"dsh":{"profile":{"bundles":[]}}}
JSON
if DSH_HOME="$fresh" bash "$2" ensure-selected >/dev/null 2>&1; then
  echo "ensure-selected accepted a missing dependency"; exit 0
fi

echo ok
`,
            'bash',
            launcherPath,
            seedPath,
          ],
          { encoding: 'utf8' },
        ).trim();
      } catch (error) {
        probe = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
      }
      report(
        '★ 装了 ≠ 选中：启动器拒启并给修复命令；setup 的"确保选中"幂等补回（否则只有一台没入口的实例）',
        probe === 'ok' && addAt !== -1 && ensureAt !== -1 && addAt < ensureAt,
        probe === 'ok'
          ? `缺则拒启 + 补齐 + 第二遍不写 + 依赖没装成不硬塞；ensure 排在 add 之后（${addAt} < ${ensureAt}）✅`
          : `探针输出：${probe}`,
      );
    },
  },
  {
    title:
      '★ 独立实例的端口写在 profile 里（`dsh-workbench` 与裸 `dsh workbench` 是同一个实例，端口不该由启动方式决定）',
    run(_ctx, report) {
      const seed = read(pkg('scripts/seed-profile.sh'));
      const bundleLayer = read(pkg('cordis.patch.yml'));
      const needles = [
        'pin_instance_port',
        'id:[[:space:]]*"?webserver',
        'ctx.webStartup.port ?? (+process.env.WORKBENCH_PORT || 3081)',
      ];
      const found = needles.filter((needle) => seed.includes(needle)).length;
      const inBundleLayer = bundleLayer.includes('webserver');
      report(
        '★ 独立实例的端口写在 profile 里（`dsh-workbench` 与裸 `dsh workbench` 是同一个实例，端口不该由启动方式决定）',
        found === needles.length && !inBundleLayer,
        `seed 里 ${String(found)}/${String(needles.length)} 处 · bundle 层${inBundleLayer ? '写了（会跟着装进 dsh web 的 profile）' : '没写'}`,
      );
    },
  },
];
