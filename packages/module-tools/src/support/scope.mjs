export function scopedPackages(packages, scope) {
  if (scope === undefined) return packages;
  return packages.filter((pkg) => scope.has(pkg.manifest.name));
}

export function scopeNote(scope) {
  return scope === undefined
    ? ''
    : `（本次只检查 ${[...scope].join(' / ')}；单元重复 / 供应冲突 / 工作台指向模块按全工作区校验）`;
}
