import {
  keepPreviousData,
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { memo, useCallback, useMemo, useState } from 'react';
import { flattenInfiniteField, isTempId } from 'define-query';
import type { Post } from '../../api/types';
import { FeatureTag } from '../../components/FeatureTag';
import { RefetchIndicator } from '../../components/RefetchIndicator';
import { TimelineListSkeleton } from '../../components/Skeleton';
import { useDebouncedEffect } from '../../hooks/use-debounced-effect';
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

const TimelineHeader = memo(function TimelineHeader() {
  return (
    <header className={panelHeaderCls}>
      <h2 className={panelTitleCls}>Timeline</h2>
      <FeatureTag label="useInfiniteQuery" />
      <FeatureTag label="prepend: 'items'" />
      <FeatureTag label="draft + rollback" />
      <FeatureTag label="sync.set (×2)" />
    </header>
  );
});

const TimelineRow = memo(function TimelineRow({
  post,
  selected,
  dimmed,
  onSelect,
  onPrefetch,
}: {
  post: Post;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
  onPrefetch: (id: string) => void;
}) {
  return (
    <li className={dimmed ? 'opacity-75' : undefined}>
      <button
        type="button"
        className={selected ? listItemActiveCls : listItemCls}
        onMouseEnter={() => onPrefetch(post.id)}
        onClick={() => onSelect(post.id)}
      >
        <strong>{post.title || '(no title)'}</strong>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{post.commentCount} comments</span>
      </button>
    </li>
  );
});

const TimelineSearch = memo(function TimelineSearch({
  className,
  onDebouncedChange,
}: {
  className: string;
  onDebouncedChange: (value: string) => void;
}) {
  const [search, setSearch] = useState('');

  useDebouncedEffect(search, 200, onDebouncedChange);

  return (
    <input
      className={className}
      type="search"
      placeholder="Search posts (min 2 chars)…"
      value={search}
      onChange={event => setSearch(event.target.value)}
    />
  );
});

/** Create only runs with empty search — mutation key is always { q: '' }. */
const CREATE_PARAMS = { q: '' } as const;

const TimelineCreateForm = memo(function TimelineCreateForm({
  disabled,
  onCreated,
}: {
  disabled: boolean;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const create = useMutation({
    ...createTimelinePostMutation(CREATE_PARAMS),
    onSuccess: post => {
      setTitle('');
      setBody('');
      onCreated(post.id);
    },
  });

  const titleError = create.error?.field('title');
  const bodyError = create.error?.field('body');
  const generalError = create.error?.banner();

  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;
    create.reset();
    create.mutate({ title, body });
  }

  return (
    <form className={formStackCls} onSubmit={submitCreate}>
      <input
        className={inputCls}
        value={title}
        onChange={event => setTitle(event.target.value)}
        placeholder="Post title…"
        disabled={disabled || create.isPending}
      />
      <textarea
        className={`${inputCls} min-h-14 resize-y font-[inherit]`}
        value={body}
        onChange={event => setBody(event.target.value)}
        placeholder="Post body…"
        rows={2}
        disabled={disabled || create.isPending}
      />
      <button type="submit" className={`${actionBtnCls} self-start`} disabled={disabled || create.isPending}>
        {create.isPending ? 'Creating…' : 'Add post'}
      </button>
      {disabled && (
        <p className={`${mutedCls} m-0 w-full`}>Clear search to add a post.</p>
      )}
      {titleError && <p className={`${errorCls} m-0 w-full`}>{titleError}</p>}
      {bodyError && <p className={`${errorCls} m-0 w-full`}>{bodyError}</p>}
      {generalError && !titleError && !bodyError && (
        <p className={`${errorCls} m-0 w-full`}>{generalError}</p>
      )}
    </form>
  );
});

const TimelineList = memo(function TimelineList({
  items,
  selectedId,
  isCreating,
  isRefetching,
  onSelect,
  onPrefetch,
}: {
  items: Post[];
  selectedId: string | null;
  isCreating: boolean;
  isRefetching: boolean;
  onSelect: (id: string) => void;
  onPrefetch: (id: string) => void;
}) {
  return (
    <ul className={`${timelineListCls}${isRefetching ? ` ${refetchDimCls}` : ''}`}>
      {items.map(post => (
        <TimelineRow
          key={post.id}
          post={post}
          selected={selectedId === post.id}
          dimmed={isCreating && isTempId(post.id)}
          onSelect={onSelect}
          onPrefetch={onPrefetch}
        />
      ))}
    </ul>
  );
});

export const TimelinePanel = memo(function TimelinePanel({ selectedId, onSelect }: Props) {
  const queryClient = useQueryClient();
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const params = useMemo(() => ({ q: debouncedSearch }), [debouncedSearch]);
  const createDisabled = debouncedSearch.length > 0;

  const timeline = useInfiniteQuery({
    ...timelineInfiniteQuery(params),
    enabled: debouncedSearch.length === 0 || debouncedSearch.length >= 2,
    placeholderData: keepPreviousData,
  });

  const isCreating =
    useIsMutating({ mutationKey: createTimelinePostMutation.key(CREATE_PARAMS) }) > 0;

  const items = timeline.data ? flattenInfiniteField(timeline.data, 'items') : [];

  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect]);
  const handleCreated = useCallback((id: string) => onSelect(id), [onSelect]);
  const handleDebouncedSearch = useCallback((value: string) => {
    setDebouncedSearch(value);
  }, []);

  const handlePrefetch = useCallback(
    (id: string) => {
      const key = postQuery.key(id);
      const state = queryClient.getQueryState(key);
      const hasFreshData = !!state?.data && !state.isInvalidated;
      if (hasFreshData) return;
      void queryClient.prefetchQuery(postQuery(id));
    },
    [queryClient],
  );

  const isRefetching = timeline.isFetching && !!timeline.data;

  return (
    <section className={panelCls}>
      <RefetchIndicator active={isRefetching} />
      <TimelineHeader />
      <TimelineCreateForm disabled={createDisabled} onCreated={handleCreated} />

      <TimelineSearch
        className={`${inputCls} mb-3`}
        onDebouncedChange={handleDebouncedSearch}
      />

      {timeline.isPending && !timeline.data
        ? <TimelineListSkeleton />
        : (
          <TimelineList
            items={items}
            selectedId={selectedId}
            isCreating={isCreating}
            isRefetching={isRefetching}
            onSelect={handleSelect}
            onPrefetch={handlePrefetch}
          />
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
});
