export function evalPayloadOf(script: string): string {
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  return `(0,eval)(decodeURIComponent(escape(atob('${encoded}'))))`;
}
