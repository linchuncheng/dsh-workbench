import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';

export interface CopyFlash {
  copy(text: string, onCopied: (copied: boolean) => void): void;
  dispose(): void;
}

/**
 * 「复制一下、按钮亮一会儿再复原」这件小事的计时器：组件只负责把结果写进自己的状态。
 * @param ms - 「已复制」亮多久（毫秒）。
 * @returns `copy` 成功后先给 `true`，到点再给 `false`；`dispose` 清掉未到点的计时器。
 */
export function createCopyFlash(ms: number): CopyFlash {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    copy(text, onCopied) {
      void writeClipboard(text).then((ok) => {
        if (!ok) return;
        onCopied(true);
        clear();
        timer = setTimeout(() => {
          timer = undefined;
          onCopied(false);
        }, ms);
      });
    },
    dispose: clear,
  };
}
