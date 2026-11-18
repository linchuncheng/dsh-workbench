export interface NpmrcEntry {
  readonly key: string;
  readonly value: string;
}

export function npmrcEntries(text: string): readonly NpmrcEntry[] {
  const rows: NpmrcEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const value = line.slice(at + 1).trim();
    if (value === '') continue;
    rows.push({ key: line.slice(0, at).trim(), value });
  }
  return rows;
}
