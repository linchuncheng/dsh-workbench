export function evalPayloadOf(script: string): string {
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  return `Function(decodeURIComponent(escape(atob('${encoded}'))))()`;
}
