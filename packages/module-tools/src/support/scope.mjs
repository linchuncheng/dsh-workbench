import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { discoverModulePackages } from './discover.mjs';

export function scopedPackages(packages, scope) {
  if (scope === undefined) return packages;
  return packages.filter((pkg) => scope.has(pkg.manifest.name));
}

export function scopeNote(scope) {
  return scope === undefined
    ? ''
    : `（本次只检查 ${[...scope].join(' / ')}；单元重复 / 供应冲突 / 工作台指向模块按全工作区校验）`;
}

export function modulePackagesOf(options = {}) {
  return scopedPackages(discoverModulePackages({ root: process.cwd() }), options.scope);
}

export function skipReport(note) {
  return { status: 'skip', notes: [note], problems: [] };
}

export function moduleTargets(options, configFile, howToJoin, emptyReason, missingReason) {
  const modulePackages = modulePackagesOf(options);
  if (modulePackages.length === 0) return { skip: skipReport(emptyReason) };
  const declared = modulePackages.filter((pkg) => existsSync(join(pkg.dir, configFile)));
  if (declared.length === 0) {
    return {
      skip: skipReport(
        `${modulePackages.length} 个模块包都没有 ${configFile} —— ${missingReason}（不代表没有问题）。\n  ${howToJoin}`,
      ),
    };
  }
  return { modulePackages, declared };
}
