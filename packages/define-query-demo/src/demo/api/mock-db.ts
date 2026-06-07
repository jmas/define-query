import type { Comment, Post } from './types';

let nextCommentId = 1;

function makeComments(texts: string[], dayOffset = 0): Comment[] {
  const startId = nextCommentId;
  nextCommentId += texts.length;
  return texts.map((text, index) => ({
    id: `c${startId + index}`,
    text,
    createdAt: new Date(Date.UTC(2026, 5, 1 + dayOffset, 9 + (index % 8), (index * 7) % 60)).toISOString(),
  }));
}

const postDefs: Array<Omit<Post, 'commentCount'>> = [
  {
    id: '1',
    title: 'Define Query intro',
    body: 'Each query is an isolated cache region with typed patch mutations.',
  },
  {
    id: '2',
    title: 'Optimistic append',
    body: 'Comments appear instantly with a temp id, then settle from the mock API.',
  },
  {
    id: '3',
    title: 'Parametric search',
    body: 'Timeline query keys include search + page params.',
  },
  {
    id: '4',
    title: 'Touch invalidation',
    body: 'Adding a comment refetches the post header commentCount.',
  },
  {
    id: '5',
    title: 'Infinite scroll timeline',
    body: 'useInfiniteQuery pages through the mock timeline with flattenInfiniteField.',
  },
  {
    id: '6',
    title: 'sync.reflect across queries',
    body: 'Renaming a post patches matching items in sibling timeline caches.',
  },
  {
    id: '7',
    title: 'Prefetch on hover',
    body: 'Timeline rows prefetch the post query before you open the detail panel.',
  },
  {
    id: '8',
    title: 'Retry failed append items',
    body: 'Prefix a comment with "fail " to simulate a network error and keep the row for retry.',
  },
  {
    id: '9',
    title: 'ValidationError from mock API',
    body: 'Empty comments return field-level 422 errors without throwing to the component.',
  },
  {
    id: '10',
    title: 'Parametric query keys',
    body: 'Search debounce + placeholderData keep the list stable while params change.',
  },
  {
    id: '11',
    title: 'structuralSharing: false',
    body: 'Post and comments queries opt out so patch diffs always produce fresh references.',
  },
  {
    id: '12',
    title: 'remove + cache invalidation',
    body: 'Deleting a post patches infinite + paginated timelines and drops its comments.',
  },
];

let nextPostId = postDefs.length + 1;

const commentsByPostId = new Map<string, Comment[]>([
  [
    '1',
    makeComments([
      'Suspense + patches = nice DX',
      'merge() for inline edits',
      'How is this different from plain TanStack Query?',
      'Define Query gives you typed mutations out of the box',
      'Love the patch.append flow for comments',
      'Does sync.bump work with infinite lists too?',
      'Yes — reflect and bump are query-aware',
      'The demo latency slider is great for testing loading states',
      'Can I nest queries?',
      'Each query is flat; compose with sync recipes instead',
    ]),
  ],
  [
    '2',
    makeComments([
      'autoId in append rocks',
      'onFail:keep saved me during flaky Wi‑Fi testing',
      'Temp ids make the list feel instant',
      'Retry button on failed rows is clutch',
      'Does edit work while append is pending?',
      'In this demo, yes — separate mutation hooks',
    ], 1),
  ],
  ['3', makeComments([], 2)],
  [
    '4',
    makeComments([
      'First!',
      'touch[] refreshes siblings',
      'No manual setQueryData',
      'commentCount updates without refetching the whole post',
      'sync.bump is underrated',
      'Does delete also bump down?',
      'Yep — check remove mutation on comments query',
      'What about concurrent adds?',
      'Each append gets its own temp id',
      'I added three comments in a row — count stayed correct',
      'The header badge is a nice sanity check',
      'Can bump target nested fields?',
      'Here it targets post.commentCount directly',
      'Would love a counter animation',
      'Even without animation, the number is reliable',
    ], 3),
  ],
  [
    '5',
    makeComments([
      'Load more feels natural with 12 posts',
      'flattenInfiniteField saved me from nested page loops',
      'pageSize 3 makes pagination obvious in the demo',
      'End of list state is clear',
    ], 4),
  ],
  [
    '6',
    makeComments([
      'reflect merged my rename into the timeline instantly',
      'No invalidate storm after inline edit',
      'Does it match by id across pages?',
      'Matching uses query key prefix + item id',
      'What if the post is not in cache yet?',
      'Then reflect is a no-op until the query loads',
      'Still better than invalidating everything',
    ], 5),
  ],
  [
    '7',
    makeComments([
      'Hover prefetch makes opening posts feel snappy',
      'Even with 400ms latency the panel opens warm',
    ], 6),
  ],
  [
    '8',
    makeComments([
      'fail network is my favorite test hook',
      'Kept rows show the error message inline',
      'Retry clears the failed state',
      'Try fail then fix the text before retry',
      'append onFail:keep is the right default here',
      'Does remove work on failed rows?',
      'Yes — they are normal list items with status',
      'Great for teaching optimistic UI failure modes',
      'I use this pattern in production now',
    ], 7),
  ],
  ['9', makeComments(['Empty submit → fields.text validation'], 8)],
  [
    '10',
    makeComments([
      'Debounced search avoids spamming the mock API',
      'Min 2 chars prevents noisy queries',
      'placeholderData keeps the old list visible',
      'Param keys include q so caches do not collide',
      'Search "sync" to see filtering',
    ], 9),
  ],
  [
    '11',
    makeComments([
      'Fresh refs help React.memo child components',
      'Worth it when patches mutate deeply',
      'Default sharing is fine for read-mostly queries',
    ], 10),
  ],
  [
    '12',
    makeComments([
      'Delete post removes it from infinite timeline',
      'Comments map entry is cleaned up too',
      'invalidate ensures stale paginated views refresh',
      'patchMatching is clever for partial key overlap',
      'Try deleting while another tab has the post open',
      'Closed panel handles missing post gracefully',
      'remove.cache drops the post query entirely',
      'Good exercise for cache consistency',
      'I broke my app once without this pattern',
      'sync recipes beat manual queryClient calls',
      'Document remove flows — easy to get wrong',
    ], 11),
  ],
]);

const posts: Post[] = postDefs.map(def => ({
  ...def,
  commentCount: commentsByPostId.get(def.id)?.length ?? 0,
}));

const comments = commentsByPostId;

export function getPost(id: string): Post | undefined {
  const post = posts.find(item => item.id === id);
  return post ? { ...post } : undefined;
}

export function createPost(
  title: string,
  body: string,
): Post | { error: Record<string, string[]> } {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle) {
    return { error: { title: ['Title cannot be empty'] } };
  }
  if (!trimmedBody) {
    return { error: { body: ['Body cannot be empty'] } };
  }

  const post: Post = {
    id: String(nextPostId++),
    title: trimmedTitle,
    body: trimmedBody,
    commentCount: 0,
  };

  posts.unshift(post);
  comments.set(post.id, []);
  return { ...post };
}

export function updatePost(id: string, patch: Partial<Pick<Post, 'title' | 'body'>>): Post | undefined {
  const post = posts.find(item => item.id === id);
  if (!post) return undefined;
  Object.assign(post, patch);
  return { ...post };
}

export function deletePost(id: string): boolean {
  const index = posts.findIndex(item => item.id === id);
  if (index === -1) return false;
  posts.splice(index, 1);
  comments.delete(id);
  return true;
}

export function getComments(postId: string): Comment[] {
  return (comments.get(postId) ?? []).map(comment => ({ ...comment }));
}

export function addComment(
  postId: string,
  text: string,
): { comment: Comment } | { error: Record<string, string[]> } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { error: { text: ['Comment cannot be empty'] } };
  }

  const post = posts.find(item => item.id === postId);
  if (!post) return { error: { text: ['Post not found'] } };

  const comment: Comment = {
    id: `c${nextCommentId++}`,
    text: trimmed,
    createdAt: new Date().toISOString(),
  };

  const list = comments.get(postId) ?? [];
  list.push(comment);
  comments.set(postId, list);
  post.commentCount = list.length;

  return { comment: { ...comment } };
}

export function removeComment(postId: string, commentId: string): boolean {
  const list = comments.get(postId);
  if (!list) return false;

  const next = list.filter(comment => comment.id !== commentId);
  if (next.length === list.length) return false;

  comments.set(postId, next);
  const post = posts.find(item => item.id === postId);
  if (post) post.commentCount = next.length;
  return true;
}

export function updateComment(postId: string, commentId: string, text: string): Comment | undefined {
  const list = comments.get(postId);
  if (!list) return undefined;
  const comment = list.find(item => item.id === commentId);
  if (!comment) return undefined;
  comment.text = text.trim();
  return { ...comment };
}

export function searchTimeline(q: string, page: number, pageSize = 3): {
  items: Post[];
  total: number;
  page: number;
  pageSize: number;
} {
  const normalized = q.trim().toLowerCase();
  const filtered = posts.filter(post => {
    if (!normalized) return true;
    return (
      post.title.toLowerCase().includes(normalized)
      || post.body.toLowerCase().includes(normalized)
    );
  });

  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize).map(post => ({ ...post })),
    total: filtered.length,
    page,
    pageSize,
  };
}
