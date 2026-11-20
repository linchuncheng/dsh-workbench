import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN, fillPendingDesign } from '../lib.mjs';

const TITLE = '文档：init 生成用户 README 与作者 DEVELOPING；design render 两份都更新；绑定与审批图缺了直接红；旧 README 能迁到 DEVELOPING';

function run(args) {
  return execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8', stdio: 'pipe' });
}

function read(dir, file) {
  return readFileSync(join(dir, file), 'utf8');
}

function failureOf(args) {
  try {
    run(args);
    return '';
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
}

function applyRed(source, operation) {
  if (operation.title !== undefined) source.title = operation.title;
  if (operation.dropApproval === true) source.shots = source.shots.filter((one) => one.kind !== 'approval');
  if (operation.dropBound !== undefined) {
    const [field, value] = operation.dropBound;
    source[field] = source[field].filter((one) => {
      if (typeof one === 'string') return true;
      const bound = field === 'agent' ? one.capabilities : field === 'trouble' ? one.states : [one.config];
      return !(bound ?? []).includes(value);
    });
  }
  if (operation.setCapabilities !== undefined) {
    const [index, names] = operation.setCapabilities;
    source.agent[index].capabilities = names;
  }
}

const CARD = '┌─ 卡片 ─┐\n│ ● 标题 │\n└────────┘';

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const probe = mkdtempSync(join(tmpdir(), 'wb-docs-'));
      const problems = [];
      const sourceFile = join(probe, 'readme.json');
      const manifestFile = join(probe, 'package.json');
      try {
        run(['init', 'demo', '--dir', probe, '--template', 'diy']);
        if (!existsSync(sourceFile)) problems.push('init 没生成 readme.json');
        fillPendingDesign(probe);
        run(['design', 'render', '--cwd', probe]);
        run(['design', 'check', '--cwd', probe]);

        const readme = read(probe, 'README.md');
        const developing = read(probe, 'DEVELOPING.md');
        for (const heading of ['## 你会看到什么', '## 你能做什么', '## agent 能做什么', '## 数据从哪来', '## 装和卸', '## 出问题先看']) {
          if (!readme.includes(heading)) problems.push(`README 缺「${heading}」`);
        }
        for (const token of ['src/', 'dsh-wb-module', 'design.json', '路由']) {
          if (readme.includes(token)) problems.push(`README 还带着开发者内容：${token}`);
        }
        const drawn = read(probe, 'README.md');
        if (!drawn.includes('## 界面预览')) problems.push('README 缺「界面预览」那一节');
        if (!drawn.includes(`\`\`\`\n${CARD}`)) problems.push('卡片图没画进 README');
        if (!/## 你会看到什么\n\n- 填好/.test(drawn)) problems.push('正文没按条目渲染');

        const baseline = JSON.parse(read(probe, 'readme.json'));
        const expectRed = (mutate, needle, label) => {
          const next = structuredClone(baseline);
          mutate(next);
          writeFileSync(sourceFile, `${JSON.stringify(next, null, 2)}\n`);
          let out = '';
          try {
            run(['design', 'check', '--cwd', probe]);
          } catch (error) {
            out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
          }
          if (!out.includes(needle)) problems.push(`${label}没拦住（找「${needle}」）`);
          writeFileSync(sourceFile, `${JSON.stringify(baseline, null, 2)}\n`);
        };

        const redCases = [
          ['漏掉写能力的 agent 文案时', { dropBound: ['agent', 'demo_add_note'] }, '能力「demo_add_note」没有用户文案'],
          ['绑错了能力名时', { setCapabilities: [0, ['no_such_capability']] }, '不存在的能力'],
          ['漏掉设置文案时', { dropBound: ['do', 'limit'] }, '设置「limit」没有用户文案'],
          ['漏掉空态排障时', { dropBound: ['trouble', 'empty'] }, '状态「empty」没有排障文案'],
          ['有写工具却没画审批屏时', { dropApproval: true }, '没有审批图'],
          ['标题与卡片名不一致时', { title: '别的名字' }, '两处应使用同一个名称'],
        ];
        for (const [label, operation, needle] of redCases) {
          expectRed((source) => applyRed(source, operation), needle, label);
        }

        const sourceFileBefore = read(probe, 'readme.json');
        const manifest = JSON.parse(read(probe, 'package.json'));
        const tools = manifest.dsh.workbench.tools.map((one) => ({ ...one, writes: false }));
        writeFileSync(manifestFile, `${JSON.stringify({ ...manifest, dsh: { ...manifest.dsh, workbench: { ...manifest.dsh.workbench, tools } } }, null, 2)}\n`);
        const noWriteFailure = failureOf(['design', 'check', '--cwd', probe]);
        if (!noWriteFailure.includes('没有写工具，却有审批图')) {
          problems.push('没有写工具却有审批图时没拦住');
        }
        writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        writeFileSync(sourceFile, sourceFileBefore);

        run(['design', 'render', '--cwd', probe]);
        run(['design', 'check', '--cwd', probe]);

        if (!developing.includes('## 生成后的结构')) problems.push('DEVELOPING 缺开发者章节');
        if (!developing.includes('<!-- dsh-wb:design:start -->')) problems.push('DEVELOPING 缺 design 标记');
        if (!developing.includes('### 表 1 面板')) problems.push('DEVELOPING 缺 design 表');

        const design = JSON.parse(read(probe, 'design.json'));
        design.oneLine = 'ENGINEERING_ONLY_SENTINEL';
        writeFileSync(join(probe, 'design.json'), `${JSON.stringify(design, null, 2)}\n`);
        run(['design', 'render', '--cwd', probe]);
        if (read(probe, 'README.md').includes('ENGINEERING_ONLY_SENTINEL')) {
          problems.push('README 把 design.json 的工程字段带进来了');
        }
        run(['design', 'check', '--cwd', probe]);

        const source = JSON.parse(read(probe, 'readme.json'));
        source.see = ['打开 src/host.ts 看'];
        writeFileSync(sourceFile, `${JSON.stringify(source, null, 2)}\n`);
        const copyFailure = failureOf(['design', 'check', '--cwd', probe]);
        if (!copyFailure.includes('源码路径')) problems.push('用户文案里的源码路径没被点出来');
        source.see = ['填好'];
        writeFileSync(sourceFile, `${JSON.stringify(source, null, 2)}\n`);
        run(['design', 'render', '--cwd', probe]);
        run(['design', 'check', '--cwd', probe]);

        writeFileSync(join(probe, 'README.md'), '# old module\n\n## 生成出来的形状\n\n旧开发者说明\n');
        unlinkSync(join(probe, 'DEVELOPING.md'));
        run(['design', 'migrate', '--cwd', probe]);
        const migrated = read(probe, 'DEVELOPING.md');
        const user = read(probe, 'README.md');
        if (!migrated.includes('旧开发者说明')) problems.push('migrate 没把旧 README 保存到 DEVELOPING');
        if (!user.includes('## 你会看到什么')) problems.push('migrate 没重生成用户 README');
        if (!existsSync(join(probe, 'design.json'))) problems.push('design.json 不见了');
      } catch (error) {
        const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        problems.push(`流程跑红：${out.trim().split('\n').slice(-3).join(' | ')}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(TITLE, problems.length === 0, problems.join(' · '));
    },
  },
];
