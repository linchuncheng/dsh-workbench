import type { DiagRecorder } from '../runtime/diag-records.js';

const CORRUPT_DIR = '.corrupt';

/**
 * 单元配置的落盘接口：`deps.store.for(unit, workspace)` 交出来的那个形状。
 */
export interface UnitConfigStore {
  read(name: string): unknown | null;
  write(name: string, value: unknown): void;
  remove(name: string): void;
}

/**
 * `createUnitConfig` 的入参。
 */
export interface UnitConfigOptions<T> {
  readonly store: UnitConfigStore;
  readonly file: string;
  readonly fallback: T;
  readonly normalize: (raw: unknown) => T;
  readonly logger?: { warn?(message: string): void } | undefined;
  readonly diag?: DiagRecorder | undefined;
}

/**
 * 一份单元配置的读写器：读坏了退回兜底，写入前先规范化。
 */
export interface UnitConfig<T> {
  read(): T;
  write(payload: unknown): T;
  reset(): void;
}

/**
 * 把「一个 JSON 文件 + 一份兜底 + 一个规范化函数」接成模块配置的读写器。
 * @param options.store - 落盘位置：模块自己的 `deps.store.for(unit, workspace)`。
 * @param options.file - 文件名（如 `config.json`）。
 * @param options.fallback - 没存过或存坏了时返回的那份。
 * @param options.normalize - 把任意输入收成 `T`；写口不合法时直接抛。
 * @param options.logger - 读到坏配置时提醒一次（不填就只备份、不吭声）。
 * @returns 读 / 写 / 清空三件事。
 */
export function createUnitConfig<T>({
  store,
  file,
  fallback,
  normalize,
  logger,
  diag,
}: UnitConfigOptions<T>): UnitConfig<T> {
  let broken = false;
  let raw: unknown = null;
  const noteBroken = (kept: unknown, reason: string): void => {
    if (broken) return;
    broken = true;
    raw = kept;
    logger?.warn?.(
      `[dsh-workbench] ${file} 读不出来（${reason}）：这次先按默认值处理；下一次写入会把它备份到 ${CORRUPT_DIR}/，不会直接盖掉`,
    );
    diag?.once(`config-corrupt:${file}`, {
      code: 'CONFIG_CORRUPT',
      level: 'error',
      detail: { path: file, reason },
    });
  };
  return {
    read() {
      const kept = store.read(file);
      if (kept === null) return fallback;
      try {
        return normalize(kept);
      } catch (error) {
        noteBroken(kept, error instanceof Error ? error.message : String(error));
        return fallback;
      }
    },
    write(payload) {
      const value = normalize(payload);
      if (broken) {
        try {
          store.write(`${CORRUPT_DIR}/${file}.${new Date().toISOString().replace(/[:.]/g, '-')}`, raw);
        } catch (error) {
          throw new Error(
            `这份配置读不出来，备份也失败，为了不弄丢它没有覆盖：${file}（${error instanceof Error ? error.message : String(error)}）`,
            { cause: error },
          );
        }
        broken = false;
      }
      store.write(file, value);
      return value;
    },
    reset() {
      broken = false;
      store.remove(file);
    },
  };
}
