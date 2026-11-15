/**
 * 进程号是否还活着。
 * @param pid 进程号；非正整数一律视为不在。
 * @returns 存活为 `true`。权限不足（EPERM）说明进程存在，算活着。
 */
export function pidAlive(pid: unknown): boolean {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
