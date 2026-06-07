import { defineInfiniteQuery, defineQuery } from 'define-query';
import { demoApi } from '../api';
import type { TimelinePage } from '../api/types';

export const postQuery = defineQuery({
  key: (id: string) => ['post', id] as const,
  fetch: (id: string) => demoApi.getPost(id),
  options: {
    staleTime: 4_000,
  },
});

export const postCommentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'] as const,
  fetch: (postId: string) => demoApi.getComments(postId),
});

export const timelineQuery = defineQuery({
  key: (params: { q: string; page: number }) => ['timeline', params] as const,
  fetch: (params: { q: string; page: number }) => demoApi.getTimeline(params.q, params.page),
});

export const timelineInfiniteQuery = defineInfiniteQuery({
  key: (params: { q: string }) => ['timeline-infinite', params] as const,
  fetch: (params, page) => demoApi.getTimeline(params.q, page),
  initialPage: 1,
  nextPage: (lastPage: TimelinePage) => {
    const maxPage = Math.max(1, Math.ceil(lastPage.total / lastPage.pageSize));
    return lastPage.page < maxPage ? lastPage.page + 1 : undefined;
  },
});
