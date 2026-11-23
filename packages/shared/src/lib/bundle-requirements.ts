export function requirementsText(requirements: Readonly<Record<string, string>> | undefined): string | undefined {
  const parts = Object.entries(requirements ?? {})
    .filter(([, range]) => range.trim() !== '')
    .map(([name, range]) => `${name === 'engines.dsh' ? 'dsh' : name} ${range}`);
  return parts.length === 0 ? undefined : parts.join('、');
}

export function requirementVersionText(
  requirements: Readonly<Record<string, string>> | undefined,
): string | undefined {
  const entries = Object.entries(requirements ?? {});
  const picked = entries.find(([name]) => name === 'engines.dsh') ?? entries[0];
  if (picked === undefined) return undefined;
  const raw = picked[1].trim();
  const stripped = raw.replace(/^(>=|<=|>|<|=|\^|~)\s*/, '');
  return /^\d/.test(stripped) && !/[\s|<>=]/.test(stripped) ? stripped : raw;
}
