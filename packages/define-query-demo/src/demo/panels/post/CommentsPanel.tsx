import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import type { DefineQueryMutationError } from 'define-query';
import { memo, useCallback, useEffect, useState } from 'react';
import { mockCommentChaos } from '../../api';
import type { Comment } from '../../api/types';
import { FeatureTag } from '../../components/FeatureTag';
import {
  addCommentMutation,
  editCommentMutation,
  postCommentsQuery,
  removeCommentMutation,
} from '../../queries';
import {
  actionBtnCls,
  chaosBoxCls,
  commentRowCls,
  commentsListCls,
  errorCls,
  formCls,
  formInputCls,
  inputInlineCls,
  linkBtnCls,
  mutedCls,
  panelHeaderCls,
  panelSubtitleCls,
  subpanelCls,
} from '../../styles';

function mutationUserMessage(error: DefineQueryMutationError): string {
  return error.banner() ?? error.field('_') ?? error.field('text') ?? error.message;
}

const CommentsHeader = memo(function CommentsHeader() {
  return (
    <header className={panelHeaderCls}>
      <h3 className={panelSubtitleCls}>Comments</h3>
      <FeatureTag label="update: 'items'" />
      <FeatureTag label="removeField: 'items'" />
      <FeatureTag label="query fetch sync → commentQuery" />
    </header>
  );
});

const CommentRow = memo(function CommentRow({
  postId,
  comment,
  removeFailed,
  removeError,
  isRemovePending,
  onRemove,
}: {
  postId: string;
  comment: Comment;
  removeFailed: boolean;
  removeError: DefineQueryMutationError | null;
  isRemovePending: boolean;
  onRemove: (commentId: string) => void;
}) {
  const [text, setText] = useState(comment.text);
  const edit = useMutation(editCommentMutation(postId));

  useEffect(() => {
    setText(comment.text);
  }, [comment.id]);

  const rowCls = removeFailed
    ? `${commentRowCls} rounded-lg border border-red-300/80 bg-red-500/5 px-2 dark:border-red-900/80 dark:bg-red-500/10`
    : edit.isPending || isRemovePending
      ? `${commentRowCls} opacity-75`
      : commentRowCls;

  return (
    <li className={rowCls}>
      <input
        className={inputInlineCls}
        value={text}
        disabled={edit.isPending}
        onChange={event => setText(event.target.value)}
        onBlur={() => {
          const nextText = text.trim();
          if (!nextText || nextText === comment.text) return;
          edit.mutate({ commentId: comment.id, text: nextText });
        }}
      />
      {edit.isPending && <em className={mutedCls}>Saving…</em>}
      {edit.error && <em className={errorCls}>{mutationUserMessage(edit.error)}</em>}
      {removeError && <em className={errorCls}>{mutationUserMessage(removeError)}</em>}
      <button
        type="button"
        className={linkBtnCls}
        disabled={isRemovePending}
        onClick={() => onRemove(comment.id)}
      >
        {removeFailed ? 'Retry remove' : 'Remove'}
      </button>
    </li>
  );
});

const ChaosControls = memo(function ChaosControls() {
  const [chaosEnabled, setChaosEnabled] = useState(mockCommentChaos.enabled);
  const [chaosRate, setChaosRate] = useState(mockCommentChaos.rate);

  return (
    <div className={chaosBoxCls}>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={chaosEnabled}
          onChange={event => {
            const enabled = event.target.checked;
            setChaosEnabled(enabled);
            mockCommentChaos.enabled = enabled;
          }}
        />
        <span>Random API errors</span>
      </label>
      {chaosEnabled && (
        <label className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <span>Fail rate</span>
          <input
            type="range"
            min={10}
            max={90}
            step={5}
            value={chaosRate}
            onChange={event => {
              const rate = Number(event.target.value);
              setChaosRate(rate);
              mockCommentChaos.rate = rate;
            }}
          />
          <output className="min-w-10 font-mono text-violet-600 dark:text-violet-400">
            {chaosRate}%
          </output>
        </label>
      )}
      {chaosEnabled && (
        <p className={`${mutedCls} m-0 text-xs`}>
          Rotates realistic network, validation, and server responses. Failed adds and removes roll back — errors
          show on the row or add form.
        </p>
      )}
    </div>
  );
});

const AddCommentForm = memo(function AddCommentForm({ postId }: { postId: string }) {
  const [text, setText] = useState('');
  const add = useMutation({
    ...addCommentMutation(postId),
    onSuccess: () => setText(''),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    add.reset();
    add.mutate(text);
  }

  return (
    <form className={formCls} onSubmit={submit}>
      <input
        className={formInputCls}
        value={text}
        onChange={event => setText(event.target.value)}
        placeholder="Add comment (empty → 422, prefix fail → retry, or enable chaos)…"
        disabled={add.isPending}
      />
      <button type="submit" className={actionBtnCls} disabled={add.isPending}>
        {add.isPending ? 'Sending…' : 'Add'}
      </button>
      {add.error?.banner() && <em className={errorCls}>{add.error.banner()}</em>}
      {add.error?.field('text') && <em className={errorCls}>{add.error.field('text')}</em>}
    </form>
  );
});

export const CommentsPanel = memo(function CommentsPanel({ postId }: { postId: string }) {
  const { data } = useSuspenseQuery(postCommentsQuery(postId));
  const remove = useMutation(removeCommentMutation(postId));

  const removingId =
    remove.isPending && typeof remove.variables === 'string' ? remove.variables : null;
  const failedRemoveId =
    remove.isError && typeof remove.variables === 'string' ? remove.variables : null;

  const handleRemove = useCallback(
    (commentId: string) => {
      remove.reset();
      remove.mutate(commentId);
    },
    [remove],
  );

  return (
    <section className={subpanelCls}>
      <CommentsHeader />
      <ChaosControls />
      {removingId && (
        <p className={`${mutedCls} mb-2`}>Removing comment…</p>
      )}
      <ul className={commentsListCls}>
        {data.items.map(item => (
          <CommentRow
            key={item.id}
            postId={postId}
            comment={item}
            removeFailed={failedRemoveId === item.id}
            removeError={failedRemoveId === item.id ? remove.error : null}
            isRemovePending={remove.isPending}
            onRemove={handleRemove}
          />
        ))}
      </ul>
      <AddCommentForm postId={postId} />
    </section>
  );
});
