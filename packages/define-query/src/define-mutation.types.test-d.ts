import { assertType } from 'vitest';
import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';

type Comment = { id: string; text: string };
type Post = { id: string; title: string; commentCount: number };

const commentQuery = defineQuery({
  key: (params: { postId: string; commentId: string }) =>
    ['post', params.postId, 'comment', params.commentId] as const,
  fetch: async (params) => ({ id: params.commentId, text: 'x' }),
});

const commentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'] as const,
  fetch: async (): Promise<{ items: Comment[] }> => ({ items: [] }),
});

const postQuery = defineQuery({
  key: (id: string) => ['post', id] as const,
  fetch: async (): Promise<Post> => ({ id: 'p1', title: 't', commentCount: 0 }),
});

const timelineQuery = defineQuery({
  key: () => ['timeline'] as const,
  fetch: async (): Promise<{ items: Post[] }> => ({ items: [] }),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const add = defineMutation(commentsQuery, {
  name: 'add',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: async (_postId: string, _text: string) => ({ comment: { id: 'c1', text: 'a' } }),
  insert: 'items',
  draft: ({ input, tempId }) => ({ id: tempId!, text: input }),
  settle: response => response.comment,
  sync: on => [
    on(commentQuery).setEach('items', {
      params: (event, item) => {
        assertType<string>(event.params);
        assertType<Comment>(item);
        return { postId: event.params, commentId: item.id };
      },
      set: item => {
        assertType<Comment>(item);
        return item;
      },
    }),
    on(timelineQuery).mergeItem('items', {
      set: (item, { input }) => {
        assertType<Post>(item);
        assertType<string>(input);
        return { commentCount: item.commentCount + 1 };
      },
    }),
  ],
});

type AddInput = NonNullable<ReturnType<typeof add>['mutationFn']> extends (
  input: infer I,
  ...args: unknown[]
) => unknown
  ? I
  : never;
assertType<string>({} as AddInput);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const removePost = defineMutation(postQuery, {
  name: 'remove',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: async (_id: string) => undefined,
  removes: true,
});

type RemoveInput = NonNullable<ReturnType<typeof removePost>['mutationFn']> extends (
  input: infer I,
  ...args: unknown[]
) => unknown
  ? I
  : never;
assertType<void>({} as RemoveInput);

defineMutation(commentsQuery, {
  name: 'bad',
  request: async () => ({ ok: true }),
  insert: 'items',
  // @ts-expect-error — only one draft form allowed
  update: 'items',
  draft: () => ({ id: 'x', text: 'y' }),
});

defineMutation(commentsQuery, {
  name: 'bad-field',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: async (_postId: string, _text: string) => ({ comment: { id: 'c1', text: 'a' } }),
  // @ts-expect-error — unknown list field
  insert: 'nope',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  draft: ({ input, tempId }) => ({ id: tempId!, text: input }),
});

defineMutation(postQuery, {
  name: 'bad-arity',
  // @ts-expect-error — request must be (params) or (params, input), not three arguments
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: async (_id: string, _title: string, _meta: string) => ({
    id: 'p1',
    title: 't',
    commentCount: 0,
  }),
});
