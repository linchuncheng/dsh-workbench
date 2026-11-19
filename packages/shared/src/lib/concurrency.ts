/**
 * 有界并发地跑一组异步任务：最多 `limit` 个同时在飞，结果与 `items` 同序返回。
 * @param items - 任务输入。
 * @param limit - 同时在飞的上限（小于 1 按 1 算）。
 * @param map - 每个输入一个异步任务；任一任务抛错时整体 reject。
 * @returns 与 `items` 同序的结果数组。
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const width = Math.max(1, Math.min(Number.isFinite(limit) ? Math.floor(limit) : 1, items.length));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      if (index >= items.length) return;
      next += 1;
      results[index] = await map(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}
