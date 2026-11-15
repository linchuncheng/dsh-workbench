const TYPES: Readonly<Record<string, (value: unknown) => boolean>> = {
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  boolean: (value) => typeof value === 'boolean',
  null: (value) => value === null,
};

export function schemaProblem(value: unknown, schema: unknown, at: string): string | null {
  if (typeof schema !== 'object' || schema === null) return null;
  const rule = schema as Record<string, unknown>;
  const type = rule['type'];
  if (typeof type === 'string') {
    const check = TYPES[type];
    if (check !== undefined && !check(value)) return `${at} 要是 ${type}`;
  }
  const allowed = rule['enum'];
  if (Array.isArray(allowed) && !allowed.some((one) => one === value)) {
    return `${at} 只能是 ${allowed.map((one) => String(one)).join(' / ')}`;
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const required = rule['required'];
    if (Array.isArray(required)) {
      for (const key of required) {
        if (typeof key === 'string' && record[key] === undefined) return `${at}.${key} 要给`;
      }
    }
    const properties = rule['properties'];
    if (typeof properties === 'object' && properties !== null) {
      for (const [key, child] of Object.entries(properties)) {
        if (record[key] === undefined) continue;
        const problem = schemaProblem(record[key], child, `${at}.${key}`);
        if (problem !== null) return problem;
      }
    }
  }
  if (Array.isArray(value)) {
    const items = rule['items'];
    if (items !== undefined) {
      for (const [index, one] of value.entries()) {
        const problem = schemaProblem(one, items, `${at}[${index}]`);
        if (problem !== null) return problem;
      }
    }
  }
  return null;
}
