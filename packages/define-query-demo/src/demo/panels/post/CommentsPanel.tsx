import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { memo, useRef, useState } from 'react';
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

const CommentsHeader = memo(function CommentsHeader() {
  return (
    <header className={panelHeaderCls}>
      <h3 className={panelSubtitleCls}>Comments</h3>
      <FeatureTag label="update: 'items'" />
      <FeatureTag label="remove: 'items'" />
      <FeatureTag label="query fetch sync → commentQuery" />
    </header>
  );
});

const CommentRow = memo(function CommentRow({
  postId,
  comment,
}: {
  postId: string;
  comment: Comment;
}) {
  const edit = useMutation(
    editCommentMutation(postId),
  );
  const remove = useMutation(removeCommentMutation(postId));

  return (
    <li className={edit.isPending || remove.isPending ? `${commentRowCls} opacity-75` : commentRowCls}>
      <input
        key={comment.text}
        className={inputInlineCls}
        defaultValue={comment.text}
        disabled={edit.isPending}
        onBlur={event => {
          const nextText = event.target.value.trim();
          if (!nextText || nextText === comment.text) return;
          edit.mutate({ commentId: comment.id, text: nextText });
        }}
      />
      {edit.isPending && <em className={mutedCls}>Saving…</em>}
      {edit.error?.banner() && <em className={errorCls}>{edit.error.banner()}</em>}
      {remove.error?.banner() && <em className={errorCls}>{remove.error.banner()}</em>}
      <button
        type="button"
        className={linkBtnCls}
        disabled={remove.isPending}
        onClick={() => remove.mutate(comment.id)}
      >
        {remove.isPending ? 'Removing…' : 'Remove'}
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
          defaultChecked={mockCommentChaos.enabled}
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
            defaultValue={mockCommentChaos.rate}
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
          Rotates realistic network, validation, and server responses. Failed adds roll back — errors show on the
          form.
        </p>
      )}
    </div>
  );
});

const AddCommentForm = memo(function AddCommentForm({ postId }: { postId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const add = useMutation(addCommentMutation(postId));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = inputRef.current?.value ?? '';
    if (inputRef.current) inputRef.current.value = '';
    add.reset();
    add.mutate(text);
  }

  return (
    <form className={formCls} onSubmit={submit}>
      <input
        ref={inputRef}
        className={formInputCls}
        defaultValue=""
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

  return (
    <section className={subpanelCls}>
      <CommentsHeader />
      <ChaosControls />
      <ul className={commentsListCls}>
        {data.items.map(item => (
          <CommentRow key={item.id} postId={postId} comment={item} />
        ))}
      </ul>
      <AddCommentForm postId={postId} />
    </section>
  );
});
