export type OriginRead =
  | { readonly kind: 'ok'; readonly remote: string }
  | { readonly kind: 'no-origin'; readonly detail?: string }
  | { readonly kind: 'unknown'; readonly reason: string; readonly detail?: string };

export type BranchRead =
  | { readonly kind: 'ok'; readonly branch: string }
  | { readonly kind: 'no-branch'; readonly detail?: string | undefined }
  | { readonly kind: 'unknown'; readonly reason: string; readonly detail?: string | undefined };

export type HeadRead =
  | { readonly kind: 'ok'; readonly commit: string }
  | { readonly kind: 'no-head'; readonly detail?: string }
  | { readonly kind: 'unknown'; readonly reason: string; readonly detail?: string };

/** 只读 git 信息，不执行任意 git 命令。 */
export interface GitReader {
  /** 读 path 的 origin remote；没有回 no-origin，读不了回 unknown。 */
  origin(path: string): Promise<OriginRead>;
  /** 读当前分支；detached HEAD 回 no-branch。 */
  branch(path: string): Promise<BranchRead>;
  /** 读当前 commit；没有提交回 no-head。 */
  head(path: string): Promise<HeadRead>;
}
