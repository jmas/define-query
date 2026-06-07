import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';
import { getRowStore } from './client-state';
import { fail, isRowFailure, rowFailureId } from './errors';
import { useRowState } from './use-row-state';

type Comment = { id: string; text: string };

const commentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'],
  fetch: async (): Promise<{ items: Comment[] }> => ({ items: [] }),
  options: { staleTime: Infinity },
});

const addComment = defineMutation(commentsQuery, {
  name: 'add',
  request: async (_postId: string, text: string) => {
    if (text === 'boom') throw fail.network('offline');
    return { comment: { id: `srv-${text}`, text } };
  },
  insert: 'items',
  draft: (text, id): Comment => ({ id, text }),
  from: response => response.comment,
  keepOnFail: true,
});

function Comments({ postId }: { postId: string }) {
  const { data } = useQuery(commentsQuery(postId));
  const add = useMutation(addComment(postId));
  const rowState = useRowState(commentsQuery, postId);
  return (
    <div data-row-failure-id={isRowFailure(add.error) ? rowFailureId(add.error) : undefined}>
      <ul>
        {data?.items.map(comment => (
          <li key={comment.id} data-status={rowState(comment).status}>
            {comment.text}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => add.mutate('hi')}>
        add
      </button>
      <button type="button" onClick={() => add.mutate('boom')}>
        add-fail
      </button>
    </div>
  );
}

let testClient: QueryClient;

function renderWithClient(node: ReactNode) {
  testClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  testClient.setQueryData(['post', 'p1', 'comments'], { items: [] });
  return render(<QueryClientProvider client={testClient}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  if (testClient) getRowStore(testClient)._reset();
});

describe('native useMutation + useRowState', () => {
  it('shows an optimistic row that settles to the server id', async () => {
    renderWithClient(<Comments postId="p1" />);

    act(() => screen.getByText('add').click());

    const optimistic = await screen.findByText('hi');
    expect(optimistic.getAttribute('data-status')).toBe('pending');

    await waitFor(() => {
      expect(screen.getByText('hi').getAttribute('data-status')).toBe('ok');
    });
  });

  it('keeps a failed row marked as failed and sets RowFailure on mutation.error', async () => {
    renderWithClient(<Comments postId="p1" />);

    act(() => screen.getByText('add-fail').click());

    await waitFor(() => {
      expect(screen.getByText('boom').getAttribute('data-status')).toBe('failed');
    });

    await waitFor(() => {
      const failureId = document.querySelector('[data-row-failure-id]')?.getAttribute('data-row-failure-id');
      expect(failureId).toBeTruthy();
    });
  });
});
