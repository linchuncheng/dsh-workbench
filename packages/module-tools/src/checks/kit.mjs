import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flagValue, flagsOf } from '../support/check-flags.mjs';
import { discoverModulePackages } from '../support/discover.mjs';
import { memberFilesOf } from '../contract/shell-type-files.mjs';
import { shellClientPathOf, shellKitOf } from './shell-artifact.mjs';

const SHELL = '@dsh-workbench/core';
const KIT_SPECIFIER = '@dsh-workbench/core/client';

export const title = '工作台 kit 面';

function kitUsageOf(text) {
  const bindings = new Set();
  const BINDING = /(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:__toESM\(\s*)?require\(\s*["']@dsh-workbench\/core\/client["']\s*\)/g;
  for (const match of text.matchAll(BINDING)) bindings.add(match[1]);
  if (bindings.size === 0) {

    for (const match of text.matchAll(/([A-Za-z_$][\w$]*)\.kit\./g)) bindings.add(match[1]);
  }

  const used = new Map();
  const add = (bucket, member) => {
    if (bucket === undefined || member === undefined || member === '') return;
    if (!used.has(bucket)) used.set(bucket, new Set());
    used.get(bucket).add(member);
  };
  for (const id of bindings) {
    const dotted = new RegExp(`\\b${id}\\.kit\\.([a-z]+)\\.([A-Za-z0-9_$]+)`, 'g');
    for (const match of text.matchAll(dotted)) add(match[1], match[2]);
    const destructured = new RegExp(`\\{([^{}]*)\\}\\s*=\\s*${id}\\.kit\\.([a-z]+)\\s*;`, 'g');
    for (const match of text.matchAll(destructured)) {
      for (const raw of match[1].split(',')) {
        const name = raw.split(':')[0].trim();
        if (name !== '') add(match[2], name);
      }
    }
  }
  return used;
}

function floorOf(range) {
  if (typeof range !== 'string') return undefined;
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(range);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function below(a, b) {
  for (let at = 0; at < 3; at += 1) {
    if (a[at] !== b[at]) return a[at] < b[at];
  }
  return false;
}

function faceNotes(asked, shells) {
  const faceShell = shells[shells.length - 1] ?? shellClientPathOf(process.cwd());
  if (!asked) {
    return { notes: ['（查看这份工作台的 kit 内容：dsh-wb-module check --only kit）'] };
  }
  if (faceShell === undefined || !existsSync(faceShell)) {
    return { notes: ['（没有找到工作台的 client.js，无法列出 kit 面：请先确认 node_modules 中安装了 @dsh-workbench/core）'] };
  }
  try {
    const kit = shellKitOf(faceShell);
    const buckets = Object.keys(kit)
      .filter((bucket) => typeof kit[bucket] === 'object' && kit[bucket] !== null)
      .sort();
    if (buckets.length === 0) {
      return { notes: [`（${faceShell} 中未读取到 kit：工作台版本可能过旧）`] };
    }
    const every = new Map();
    for (const bucket of buckets) {
      for (const name of Object.keys(kit[bucket])) every.set(name, (every.get(name) ?? 0) + 1);
    }
    const flags = flagsOf();
    const one = flagValue(flags, '--file');
    const { roots, files, missing } = memberFilesOf(faceShell, [...every.keys()]);
    const rootLine =
      Object.entries(roots).length === 0
        ? '  类型面：无法读取（工作台包中没有 dist/types，@dsh-workbench/shared 也未安装）'
        : `  类型面（绝对路径）：${Object.entries(roots).map(([pkg, dir]) => `${pkg} → ${dir}`).join(' ｜ ')}` +
          ` （按名称查找文件：--file <名字>，或 --files | grep <名字>）`;

    const notes = [`这份工作台（${faceShell}）的 kit 面 —— 只能使用这些，不要自行创建：`, rootLine];
    if (one !== undefined) {
      const file = files.get(one);
      notes.push(
        file === undefined
          ? `  --file ${one}：不在该清单中（用 --files | grep ${one} 查找相近的名称）`
          : `  --file ${one}：${file} （请打开查看其 JSDoc 与 prop：sed -n '1,60p' 该文件）`,
      );
    }
    if (flags.includes('--files')) {
      notes.push(
        `  名称 → 类型文件（绝对路径，全表 ${every.size} 条，会被 tool-result-pruner 截断中间部分：用 --files | grep <名字> 获取一项）`,
      );
      for (const name of [...every.keys()].sort()) {
        notes.push(`    ${name} → ${files.get(name) ?? '（未扫描到，见上面两个根目录）'}`);
      }
      if (missing.length > 0) notes.push(`  ${missing.length} 个未扫描到：${missing.join('、')}`);
    } else if (one === undefined) {
      for (const bucket of buckets) {
        const names = Object.keys(kit[bucket]);
        const only = names.filter((name) => every.get(name) === 1).sort();
        notes.push(`  ${bucket}(${names.length})：${only.length === 0 ? '（全部来自下面的共用面）' : only.join(', ')}`);
      }
      const shared = [...every.entries()].filter(([, count]) => count > 1).map(([name]) => name).sort();
      notes.push(`  共用面(${shared.length})：每个桶中都存在 —— ${shared.join(', ')}`);
    }
    return {
      notes,
      payload: {
        shell: faceShell,
        roots,
        buckets: Object.fromEntries(buckets.map((bucket) => [bucket, Object.keys(kit[bucket])])),
        files: Object.fromEntries([...every.keys()].sort().map((name) => [name, files.get(name) ?? null])),
        missing,
      },
    };
  } catch (error) {
    return { notes: [`（无法读取这份工作台的 kit 面：${error instanceof Error ? error.message : String(error)}）`] };
  }
}

export async function run() {
  const problems = [];
  let inspected = 0;
  let noArtifact = 0;
  let noShell = 0;
  const override = process.env.DSH_WB_CORE_CLIENT;
  const shells = [];
  const modulePackages = discoverModulePackages({ root: process.cwd() });

  for (const pkg of modulePackages) {
    const name = pkg.manifest.name;
    const client = join(pkg.dir, 'client.js');
    if (!existsSync(client)) {
      noArtifact += 1;
      continue;
    }
    inspected += 1;
    const text = readFileSync(client, 'utf8');
    const used = kitUsageOf(text);
    const uses = used.size > 0 ? text.includes(KIT_SPECIFIER) : false;

    if (uses) {
      const shellClient = shellClientPathOf(pkg.dir);
      if (shellClient === undefined || !existsSync(shellClient)) {
        noShell += 1;
      } else {
        let kit;
        try {
          kit = shellKitOf(shellClient);
        } catch (error) {
          problems.push(
            `${name}: 无法读取这份工作台的 kit（${shellClient}）—— ${error instanceof Error ? error.message : String(error)}。` +
              `执行产物是这份判据唯一可信的数据来源；无法理解时不要搁置不管`,
          );
          kit = undefined;
        }
        if (kit !== undefined) {
          if (!shells.includes(shellClient)) shells.push(shellClient);
          const missing = [];
          for (const [bucket, members] of used) {
            for (const member of [...members].sort()) {
              if (kit[bucket]?.[member] === undefined) missing.push(`kit.${bucket}.${member}`);
            }
          }
          if (missing.length > 0) {
            problems.push(
              `${name}: 产物用了这份工作台（${shellClient}）里没有的 ${missing.join('、')} —— ` +
                `顶层解构不会抛出异常（得到 undefined），卡片首帧渲染时才报错 "Element type is invalid"；` +
                `工作台会把这张卡收进错误态（仅影响这一张，但用户看到的是错误页而不是你的卡）。` +
                `要么移除或替换这些成员，要么将 peer 下限提升到实际需要的那版`,
            );
          }
        }
      }
    }

    const peerFloor = floorOf(pkg.manifest.peerDependencies?.[SHELL]);
    const devFloor = floorOf(pkg.manifest.devDependencies?.[SHELL]);
    if (peerFloor !== undefined && devFloor !== undefined && below(peerFloor, devFloor) && override === undefined) {
      problems.push(
        `${name}: peer 下限 ${pkg.manifest.peerDependencies[SHELL]} 低于 devDependency ${pkg.manifest.devDependencies[SHELL]} —— ` +
          `你对用户承诺的那版工作台，产物从未针对该版本验证。请将 peer 下限提升到与 devDependency 相同的版本；` +
          `确实需要支持更旧的工作台，请用 DSH_WB_CORE_CLIENT=<那版工作台的 client.js> 运行一次 check --only kit，验证 kit 面足够`,
      );
    }
  }

  const asked = process.env.DSH_WB_ONLY === 'kit';
  const face = faceNotes(asked, shells);
  const payload = face.payload === undefined ? {} : { payload: face.payload };

  if (problems.length > 0) {

    const extra = face.payload === undefined ? {} : { payload: { ...face.payload, problems } };
    return { status: 'fail', notes: [], problems, ...extra };
  }

  if (inspected === 0) {
    const why =
      modulePackages.length === 0
        ? '没有模块包（没有声明 dsh.workbench 的包）—— 没有产物可对账'
        : `${noArtifact} 个尚未构建产物（跳过）`;
    return { status: 'skip', notes: [why, ...face.notes], problems: [], ...payload };
  }

  const notes = [
    `${inspected} 个模块的产物已核对过工作台 kit 面`,
    override === undefined ? '（按各自装的那份工作台）' : `（DSH_WB_CORE_CLIENT=${override}）`,
  ];
  if (noArtifact > 0) notes.push(`${noArtifact} 个尚未构建产物（跳过）`);
  if (noShell > 0) notes.push(`${noShell} 个未安装工作台（跳过面差）`);
  return { status: 'pass', notes: [...notes, ...face.notes], problems: [], ...payload };
}
