import { discoverPackages } from './support/discover.mjs';

export const CHECKS = {
  contracts: {
    title: '模块契约',
    summary: '单元 id、两个面、四个脚本、peer 依赖存在，以及清单与代码注册对账；站点表引用 / 未用 / origins / 信封',
    layer: 'manifest',
    load: () => import('./checks/contracts.mjs'),
  },
  protocol: {
    title: '模块声明协议',
    summary: 'dsh.workbench 的 apiVersion、静态半形状与未知键',
    layer: 'manifest',
    load: () => import('./checks/protocol.mjs'),
  },
  combo: {
    title: '工作台模块不声明 dsh.bundle',
    summary: '声明了 dsh.workbench 的模块不要声明 dsh.bundle（装载只走 profile 依赖 + wb 行）；私有包跳过',
    layer: 'manifest',
    load: () => import('./checks/combo.mjs'),
  },
  bundles: {
    title: '模块产物边界',
    summary: '宿主产物不含浏览器侧、浏览器产物不内联工作台 CSS 与夹具',
    layer: 'build',
    load: () => import('./checks/bundles.mjs'),
  },
  source: {
    title: '模块源码边界与零注释',
    summary: '零注释、包与运行时入口分开、不手写进程/锁/原子写',
    layer: 'source',
    load: () => import('./checks/source.mjs'),
  },
  seam: {
    title: '模块执行缝（写入域）',
    summary: '子进程只通过 deps.seam 门面；不直接取原始 shell / 不直接使用 child_process；清单 writes 与请求一致',
    layer: 'source',
    load: () => import('./checks/seam.mjs'),
  },
  arch: {
    title: '模块架构（分层 / 边界 / 设计系统）',
    summary: '模块自己的层序、运行时边界与设计系统配置',
    layer: 'source',
    load: () => import('./checks/arch.mjs'),
  },
  lint: {
    title: '模块代码卫生（eslint）',
    summary: '模块自己的 eslint.config.mjs 与规则集',
    layer: 'source',
    load: () => import('./checks/lint.mjs'),
  },
  primitives: {
    title: 'dsh 原语只从模块表获取',
    summary: 'dsh 包只从 kit 取，模块自己声明 external',
    layer: 'build',
    load: () => import('./checks/primitives.mjs'),
  },
  kit: {
    title: '工作台 kit 面',
    summary: '模块产物对得上所装工作台的 kit 面与 peer 下限',
    layer: 'build',
    load: () => import('./checks/kit.mjs'),
  },
  cards: {
    title: '卡片渲染',
    summary: '八态 × zh/en 渲染：不抛出异常、不空白、不显示裸键名',
    layer: 'render',
    load: () => import('./checks/cards.mjs'),
  },
  standalone: {
    title: '独立构建',
    summary: '工作台源码不在场时仍能 build + typecheck',
    layer: 'build',
    load: () => import('./checks/standalone.mjs'),
  },
  markers: {
    title: '公开包无内部标识',
    summary: '公开包不含私有源、私网 IP、内部域名后缀',
    layer: 'meta',
    load: () => import('./checks/markers.mjs'),
  },
  style: {
    title: '样式归属',
    summary: '不定义 wb-* 规则；裸标签控件改用 kit；令牌名对当前读取的清单校验',
    layer: 'source',
    load: () => import('./checks/style.mjs'),
  },
  alias: {
    title: '模块不指向工作台',
    summary: '模块源码中没有指向工作台的 @/ 引用',
    layer: 'source',
    load: () => import('./checks/alias.mjs'),
  },
};

export function checkList() {
  return Object.entries(CHECKS).map(([name, entry]) => ({
    name,
    title: entry.title,
    summary: entry.summary,
    layer: entry.layer,
  }));
}

export function renderCheckTable(rows = checkList()) {
  return [
    '| 判据 | 层 | 摘要 |',
    '|---|---|---|',
    ...rows.map((row) => `| \`${row.name}\` | ${row.layer} | ${row.summary} |`),
  ].join('\n');
}

function list(args) {
  const rows = checkList();
  if (args.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (args.includes('--markdown')) {
    console.log(renderCheckTable(rows));
    return;
  }
  for (const row of rows) console.log(`${row.name}\t${row.layer}\t${row.title}\t${row.summary}`);
}

const STATES = ['pass', 'fail', 'skip'];

function report(title, result) {
  const notes = Array.isArray(result.notes) ? result.notes : [];
  if (result.status === 'fail') {
    const problems = Array.isArray(result.problems) ? result.problems : [];
    console.log(`✖ ${title} ${problems.length} 条未通过：`);
    for (const problem of problems) console.log(`  · ${problem}`);
    for (const note of notes) console.log(`  ${note}`);
    return;
  }
  if (result.status === 'skip') {
    console.log(`○ ${title}：（不适用）${notes[0] ?? ''}`);
  } else {
    console.log(`✔ ${title}：${notes[0] ?? ''}`);
  }
  for (const note of notes.slice(1)) console.log(`  ${note}`);
}

export async function check({ only, args = [] } = {}) {
  if (args.includes('--list')) {
    list(args);
    return;
  }
  const names = only === undefined ? Object.keys(CHECKS) : [only];
  const jsonMode = args.includes('--json');
  const packageAt = args.indexOf('--package');
  const wanted = packageAt === -1 ? undefined : args[packageAt + 1];
  let filter;
  if (wanted !== undefined) {
    const packages = discoverPackages({ root: process.cwd() }).filter(
      (pkg) => pkg.manifest.dsh?.workbench !== undefined,
    );
    const matched = packages.filter((pkg) => {
      const name = pkg.manifest.name;
      const unit = pkg.manifest.dsh?.workbench?.unit;
      return name === wanted || name.endsWith(`/${wanted}`) || unit === wanted;
    });
    if (matched.length === 0) {
      const available = packages.map((pkg) => `${pkg.manifest.name}（${String(pkg.manifest.dsh?.workbench?.unit ?? '')}）`);
      console.error(`没有这个模块：${wanted}（工作区可用模块：${available.join(' / ')}）`);
      process.exit(2);
    }
    filter = new Set(matched.map((pkg) => pkg.manifest.name));
    console.log(
      `（仅检查 ${[...filter].join(' / ')}：单模块判据按此范围，工作区级不变量仍按全工作区校验；全量检查请不带 --package）`,
    );
  }
  const tally = { pass: 0, skip: 0, fail: 0 };
  const skipped = [];
  let ran = 0;
  process.env.DSH_WB_ONLY_ARGS = JSON.stringify(args);
  try {
    for (const name of names) {
      const entry = CHECKS[name];
      if (entry === undefined) {
        console.error(`无法识别的判据：${name}（可用：${Object.keys(CHECKS).join(' / ')}）`);
        process.exit(2);
      }

      process.env.DSH_WB_ONLY = only === undefined ? '' : name;
      const module = await entry.load();
      const result = await module.run({ scope: filter });

      const title = typeof module.title === 'string' && module.title !== '' ? module.title : entry.title;
      ran += 1;
      if (!STATES.includes(result.status)) {
        report(title, {
          status: 'fail',
          notes: [],
          problems: [`返回了无法识别的 status：${String(result.status)} —— 仅允许 ${STATES.join(' / ')}`],
        });
        tally.fail += 1;
        continue;
      }
      tally[result.status] += 1;
      if (result.status === 'skip') skipped.push(`${title}（${result.notes[0] ?? ''}）`);
      if (jsonMode && result.payload !== undefined) console.log(JSON.stringify(result.payload, null, 2));
      else report(title, result);
    }
  } finally {
    process.env.DSH_WB_ONLY = '';
    process.env.DSH_WB_ONLY_ARGS = '';
  }

  if (jsonMode) {
    if (tally.fail > 0) process.exit(1);
    return;
  }

  console.log(`${ran} 条判据：${tally.pass} 通过 · ${tally.skip} 不适用 · ${tally.fail} 未通过`);
  if (filter !== undefined) {
    console.log(
      `  本次只检查 ${[...filter].join(' / ')}；其余模块没有检查（工作区级不变量仍然全查）。` +
        '列整仓状态请在仓库根运行不带 --package 的 check。',
    );
  }

  if (skipped.length > 0) {
    console.log(`  这 ${skipped.length} 条本次均未检查（不代表没有问题）：`);
    for (const one of skipped) console.log(`  ○ ${one}`);
    console.log('  更换 cwd 后才能运行（在工作区中，「独立构建」无法扫描到工作台源码，「公开包无内部标识」只扫描');
    console.log('  将要发布的包）—— 要验证这两条，请回到工作台仓库根运行 `dsh-wb-module check`。');
  }
  if (tally.fail > 0) process.exit(1);
}
