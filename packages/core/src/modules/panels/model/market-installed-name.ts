export function installedNameOf(modules: readonly { readonly pkg: string }[], candidate: string): string {
  if (modules.some((one) => one.pkg === candidate)) return candidate;
  const tail = candidate.split('/').pop() ?? candidate;
  return modules.find((one) => (one.pkg.split('/').pop() ?? '') === tail)?.pkg ?? candidate;
}
