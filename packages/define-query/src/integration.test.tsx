import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';
import { fail } from './errors';

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
  draft: ({ input, tempId }): Comment => ({ id: tempId!, text: input }),
  settle: response => response.comment,
});

function Comments({ postId }: { postId: string }) {
  const { data } = useQuery(commentsQuery(postId));
  const add = useMutation(addComment(postId));
  return (
    <div>
      <ul>
        {data?.items.map(comment => (
          <li key={comment.id}>{comment.text}</li>
        ))}
      </ul>
      <button type="button" onClick={() => add.mutate('hi')}>
        add
      </button>
      <button type="button" onClick={() => add.mutate('boom')}>
        add-fail
      </button>
      {add.error && <span data-testid="error">{(add.error as Error).message}</span>}
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
});

describe('native useMutation', () => {
  it('shows a draft row that settles to the server id', async () => {
    renderWithClient(<Comments postId="p1" />);

    act(() => screen.getByText('add').click());

    await screen.findByText('hi');

    await waitFor(() => {
      const items = testClient.getQueryData<{ items: Comment[] }>(['post', 'p1', 'comments'])!.items;
      expect(items[0].id).toBe('srv-hi');
    });
  });

  it('rolls back the draft row and surfaces mutation.error on failure', async () => {
    renderWithClient(<Comments postId="p1" />);

    act(() => screen.getByText('add-fail').click());

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('offline');
    });

    const items = testClient.getQueryData<{ items: Comment[] }>(['post', 'p1', 'comments'])!.items;
    expect(items).toHaveLength(0);
  });
});
