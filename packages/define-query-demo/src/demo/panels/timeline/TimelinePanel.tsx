import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  fieldError,
  flattenInfiniteField,
  generalErrorText,
  useRowState,
} from 'define-query';
import type { Post } from '../../api/types';
import { FeatureTag } from '../../components/FeatureTag';
import { RefetchIndicator } from '../../components/RefetchIndicator';
import { TimelineListSkeleton } from '../../components/Skeleton';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import {
  createTimelinePostMutation,
  postQuery,
  timelineInfiniteQuery,
} from '../../queries';
import {
  actionBtnCls,
  errorCls,
  formStackCls,
  inputCls,
  linkBtnCls,
  listItemActiveCls,
  listItemCls,
  mutedCls,
  panelCls,
  panelHeaderCls,
  panelTitleCls,
  refetchDimCls,
  timelineListCls,
} from '../../styles';

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function TimelinePanel({ selectedId, onSelect }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const params = useMemo(() => ({ q: debouncedSearch }), [debouncedSearch]);
  const canCreate = debouncedSearch.length === 0;

  const timeline = useInfiniteQuery({
    ...timelineInfiniteQuery(params),
    enabled: debouncedSearch.length === 0 || debouncedSearch.length >= 2,
    placeholderData: keepPreviousData,
  });
  const create = useMutation({
    ...createTimelinePostMutation(params),
    onSuccess: (post) => {
      setTitle('');
      setBody('');
      onSelect(post.id);
    },
  });
  const rowState = useRowState(timelineInfiniteQuery, params);

  const items = timeline.data ? flattenInfiniteField<Post>(timeline.data, 'items') : [];
  const titleError = fieldError(create.error, 'title');
  const bodyError = fieldError(create.error, 'body');
  const generalError = generalErrorText(create.error);

  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    create.mutate({ title, body });
  }

  const isRefetching = timeline.isFetching && !!timeline.data;

  return (
    <section className={panelCls}>
      <RefetchIndicator active={isRefetching} />
      <header className={panelHeaderCls}>
        <h2 className={panelTitleCls}>Timeline</h2>
        <FeatureTag label="useInfiniteQuery" />
        <FeatureTag label="prepend: 'items'" />
        <FeatureTag label="keepOnFail + retry" />
        <FeatureTag label="sync.set (×3)" />
      </header>

      <form className={formStackCls} onSubmit={submitCreate}>
        <input
          className={inputCls}
          value={title}
          onChange={event => {
            setTitle(event.target.value);
            create.reset();
          }}
          placeholder="Post title…"
          disabled={!canCreate || create.isPending}
        />
        <textarea
          className={`${inputCls} min-h-14 resize-y font-[inherit]`}
          value={body}
          onChange={event => {
            setBody(event.target.value);
            create.reset();
          }}
          placeholder="Post body…"
          rows={2}
          disabled={!canCreate || create.isPending}
        />
        <button type="submit" className={`${actionBtnCls} self-start`} disabled={!canCreate || create.isPending}>
          {create.isPending ? 'Creating…' : 'Add post'}
        </button>
        {!canCreate && (
          <p className={`${mutedCls} m-0 w-full`}>Clear search to add a post.</p>
        )}
        {titleError && <p className={`${errorCls} m-0 w-full`}>{titleError}</p>}
        {bodyError && <p className={`${errorCls} m-0 w-full`}>{bodyError}</p>}
        {generalError && !titleError && !bodyError && (
          <p className={`${errorCls} m-0 w-full`}>{generalError}</p>
        )}
      </form>

      <input
        className={`${inputCls} mb-3`}
        type="search"
        placeholder="Search posts (min 2 chars)…"
        value={search}
        onChange={event => setSearch(event.target.value)}
      />

      {timeline.isPending && !timeline.data
        ? <TimelineListSkeleton />
        : (
      <ul className={`${timelineListCls}${isRefetching ? ` ${refetchDimCls}` : ''}`}>
        {items.map(post => {
          const row = rowState(post);
          return (
          <li
            key={post.id}
            className={row.status === 'pending' ? 'opacity-75' : undefined}
          >
            <button
              type="button"
              className={selectedId === post.id ? listItemActiveCls : listItemCls}
              onMouseEnter={() => void queryClient.prefetchQuery(postQuery(post.id))}
              onClick={() => onSelect(post.id)}
            >
              <strong>{post.title || '(no title)'}</strong>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{post.commentCount} comments</span>
            </button>
            {row.status === 'failed' && row.error && (
              <>
                <em className={errorCls}>{row.error}</em>
                {row.retry && (
                  <button type="button" className={linkBtnCls} onClick={() => void row.retry?.()}>
                    Retry
                  </button>
                )}
              </>
            )}
          </li>
          );
        })}
      </ul>
        )}

      {!items.length && timeline.data && (
        <p className={mutedCls}>No matches.</p>
      )}

      <div className="mt-2 flex items-center gap-3">
        {timeline.hasNextPage
          ? (
            <button
              type="button"
              className={actionBtnCls}
              disabled={timeline.isFetchingNextPage}
              onClick={() => void timeline.fetchNextPage()}
            >
              {timeline.isFetchingNextPage ? 'Loading more…' : 'Load more'}
            </button>
          )
          : <span className={mutedCls}>End of list</span>}
      </div>
    </section>
  );
}
