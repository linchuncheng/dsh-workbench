import { discoverModulePackages } from '../support/discover.mjs';

export const title = '工作台模块不声明 dsh.bundle';

function publishableModules() {
  return discoverModulePackages({ root: process.cwd() }).filter(
    (pkg) => pkg.manifest.dsh?.workbench?.unit !== undefined && pkg.manifest.private !== true,
  );
}

function problemOf(pkg) {
  return (
    `${pkg.manifest.name}: 工作台模块不要声明 dsh.bundle —— 装载只走 profile 依赖 + wb-<unit> 行；` +
    '仍然声明它的老包请在重新发布时去掉（启动日志会点名）'
  );
}

export async function run() {
  const modules = publishableModules();
  const problems = modules.filter((pkg) => pkg.manifest.dsh?.bundle !== undefined).map(problemOf);

  if (problems.length > 0) return { status: 'fail', notes: [], problems };
  if (modules.length === 0) {
    return {
      status: 'skip',
      notes: ['没有可发布的模块包（都是 private 或没有 dsh.workbench）—— 不需要判 dsh.bundle'],
      problems: [],
    };
  }
  return { status: 'pass', notes: [`${modules.length} 个模块都没有声明 dsh.bundle`], problems: [] };
}
