export const panelCls =
  'demo-panel relative w-full min-w-0 overflow-hidden border border-zinc-200 bg-white/95 p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] dark:border-zinc-800 dark:bg-zinc-900/95';

/** Fixed two-column shell — see index.css `.demo-grid`. */
export const demoGridCls = 'demo-grid';

export const panelMainCls = `${panelCls} min-h-[30rem]`;

export const panelHeaderCls = 'mb-3 flex flex-wrap items-center gap-2';

export const panelTitleCls = 'm-0 mr-auto text-lg font-medium text-zinc-900 dark:text-zinc-100';

export const panelSubtitleCls = 'm-0 mr-auto text-base font-medium text-zinc-900 dark:text-zinc-100';

export const subpanelCls = 'mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800';

export const featureTagCls =
  'rounded-full border border-violet-400/50 bg-violet-500/10 px-2 py-0.5 font-mono text-[0.7rem] text-zinc-900 dark:border-violet-400/40 dark:bg-violet-400/15 dark:text-zinc-100';

export const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100';

export const inputInlineCls = `${inputCls} mb-0 min-w-0 flex-1`;

export const fieldCls = 'mb-4 grid gap-2 text-sm';

export const bodyCls = 'mb-2 min-h-[3rem] leading-relaxed';

export const metaCls = 'mb-4 text-sm text-zinc-600 dark:text-zinc-400';

export const linkBtnCls = 'cursor-pointer border-0 bg-transparent p-0 font-inherit text-violet-600 dark:text-violet-400';

export const dangerBtnCls =
  'mb-2 cursor-pointer rounded-lg border border-red-300 bg-white px-3 py-1.5 text-red-700 disabled:opacity-50 dark:border-red-900 dark:bg-zinc-950 dark:text-red-400';

export const actionBtnCls =
  'cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100';

export const mutedCls = 'text-sm text-zinc-600 dark:text-zinc-400';

export const statusCls = 'text-xs text-violet-600 dark:text-violet-400';

export const errorCls = 'w-full text-sm text-red-700 dark:text-red-400';

export const emptyCls = 'grid place-items-center text-zinc-600 dark:text-zinc-400';

export const formCls = 'flex flex-wrap items-end gap-3';

export const formStackCls = 'mb-4 flex flex-col gap-3';

export const formInputCls = `${inputCls} m-0 min-w-[11.25rem] flex-1`;

export const listItemCls =
  'mb-2 flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left dark:border-zinc-700 dark:bg-zinc-950';

export const listItemActiveCls =
  'mb-2 flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-violet-400/50 bg-violet-500/10 px-3 py-2.5 text-left dark:border-violet-400/40 dark:bg-violet-400/15';

export const listItemSkeletonCls =
  'mb-2 flex w-full flex-col gap-1.5 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-700';

export const timelineListCls = 'm-0 list-none p-0';

export const chaosBoxCls =
  'mb-3 grid gap-2 rounded-lg border border-dashed border-zinc-200 p-2.5 text-sm dark:border-zinc-700';

export const commentRowCls =
  'flex flex-wrap items-center gap-2 border-b border-zinc-200 py-2 dark:border-zinc-800';

export const commentsListCls = 'mb-3 list-none space-y-0 p-0';

/** Shared shell for Suspense fallback + loaded post detail — keeps layout stable. */
export const postSuspenseContentCls = 'relative min-h-[26rem] min-w-0';

export const refetchDimCls = 'opacity-75 transition-opacity duration-300';

export const pulseBlockCls = 'animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700';
