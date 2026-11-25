export function depthOf(line: string): number {
  let depth = 0;
  for (const char of line) {
    if (char === '(' || char === '{' || char === '[') depth += 1;
    else if (char === ')' || char === '}' || char === ']') depth -= 1;
  }
  return depth;
}
