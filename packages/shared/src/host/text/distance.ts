/**
 * 两个字符串的编辑距离（Levenshtein），按字符比较，用来给拼错的包名 / 令牌名找近似项。
 * @param left 第一个字符串。
 * @param right 第二个字符串。
 * @returns 把 `left` 改成 `right` 需要的最少插入 / 删除 / 替换次数。
 */
export function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_unused, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const same = left[row - 1] === right[column - 1] ? 0 : 1;
      current.push(
        Math.min((previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1, (previous[column - 1] ?? 0) + same),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}
