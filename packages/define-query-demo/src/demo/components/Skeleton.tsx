import { memo } from 'react';
import {
  chaosBoxCls,
  commentRowCls,
  commentsListCls,
  fieldCls,
  formCls,
  listItemSkeletonCls,
  panelHeaderCls,
  postSuspenseContentCls,
  pulseBlockCls,
  subpanelCls,
  timelineListCls,
} from '../styles';

type SkeletonProps = {
  className?: string;
};

const Skeleton = memo(function Skeleton({ className = '' }: SkeletonProps) {
  return <span className={`${pulseBlockCls} ${className}`.trim()} aria-hidden />;
});

const TIMELINE_PAGE_SIZE = 3;

export const TimelineListSkeleton = memo(function TimelineListSkeleton() {
  return (
    <ul
      className={timelineListCls}
      role="status"
      aria-busy="true"
      aria-label="Loading timeline"
    >
      {Array.from({ length: TIMELINE_PAGE_SIZE }, (_, index) => (
        <li key={index}>
          <div className={listItemSkeletonCls}>
            <Skeleton className="block h-4 w-[78%] rounded" />
            <Skeleton className="block h-3.5 w-24 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
});

export const CommentRowSkeleton = memo(function CommentRowSkeleton() {
  return (
    <li className={commentRowCls} role="status" aria-busy="true" aria-label="Loading comment">
      <Skeleton className="h-9 min-w-0 flex-1 rounded-lg" />
      <Skeleton className="h-4 w-14 rounded" />
    </li>
  );
});

export const PostPanelSkeleton = memo(function PostPanelSkeleton() {
  return (
    <div
      className={postSuspenseContentCls}
      role="status"
      aria-busy="true"
      aria-label="Loading post"
    >
      <header className={panelHeaderCls}>
        <Skeleton className="mr-auto h-5 w-52 max-w-[55%] rounded-lg" />
        <Skeleton className="h-5 w-[4.5rem] rounded-full" />
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="h-5 w-32 rounded-full" />
      </header>

      <div className="mb-2 min-h-[3rem] space-y-2">
        <Skeleton className="block h-4 w-full" />
        <Skeleton className="block h-4 w-[72%]" />
      </div>

      <Skeleton className="mb-4 block h-3.5 w-36" />

      <div className={fieldCls}>
        <Skeleton className="block h-3.5 w-32" />
        <Skeleton className="block h-9 w-full rounded-lg" />
      </div>

      <Skeleton className="mb-2 block h-8 w-24 rounded-lg" />

      <section className={subpanelCls}>
        <header className={panelHeaderCls}>
          <Skeleton className="mr-auto h-4 w-24 rounded-lg" />
          <Skeleton className="h-5 w-[4.5rem] rounded-full" />
          <Skeleton className="h-5 w-36 rounded-full" />
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </header>

        <div className={chaosBoxCls}>
          <Skeleton className="block h-4 w-40" />
        </div>

        <ul className={commentsListCls}>
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className={commentRowCls}>
              <Skeleton className="h-9 min-w-0 flex-1 rounded-lg" />
              <Skeleton className="h-4 w-14 rounded" />
            </li>
          ))}
        </ul>

        <div className={formCls}>
          <Skeleton className="h-9 min-w-[11.25rem] flex-1 rounded-lg" />
          <Skeleton className="h-8 w-12 rounded-lg" />
        </div>
      </section>
    </div>
  );
});
