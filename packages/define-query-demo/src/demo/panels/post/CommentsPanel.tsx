import { useState } from 'react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useRowState } from 'define-query';
import { mockCommentChaos } from '../../api';
import {
  addCommentMutation,
  editCommentMutation,
  postCommentsQuery,
  removeCommentMutation,
} from '../../queries';
import { FeatureTag } from '../../components/FeatureTag';
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

export function CommentsPanel({ postId }: { postId: string }) {
  const [text, setText] = useState('');
  const [chaosEnabled, setChaosEnabled] = useState(mockCommentChaos.enabled);
  const [chaosRate, setChaosRate] = useState(mockCommentChaos.rate);
  const { data } = useSuspenseQuery(postCommentsQuery(postId));
  const add = useMutation(addCommentMutation(postId));
  const edit = useMutation(editCommentMutation(postId));
  const remove = useMutation(removeCommentMutation(postId));
  const rowState = useRowState(postCommentsQuery, postId);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const submitted = text;
    setText('');
    add.mutate(submitted);
  }

  return (
    <section className={subpanelCls}>
      <header className={panelHeaderCls}>
        <h3 className={panelSubtitleCls}>Comments</h3>
        <FeatureTag label="update: 'items'" />
        <FeatureTag label="keepOnFail + retry" />
        <FeatureTag label="sync → post + timeline commentCount" />
      </header>

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
            Rotates realistic network, validation, and server responses. Failed rows stay in the list — errors and retry live on the row.
          </p>
        )}
      </div>

      <ul className={commentsListCls}>
        {data.items.map(comment => {
          const row = rowState(comment);

          return (
            <li
              key={comment.id}
              className={`${commentRowCls}${row.status === 'pending' ? ' opacity-75' : ''}`}
            >
              <input
                className={inputInlineCls}
                defaultValue={comment.text}
                key={`${comment.id}-${comment.text}`}
                disabled={row.status !== 'ok'}
                onBlur={event => {
                  if (row.status !== 'ok') return;

                  const nextText = event.target.value.trim();
                  if (!nextText || nextText === comment.text) return;

                  edit.mutate({ commentId: comment.id, text: nextText });
                }}
              />
              {row.status === 'pending' && <em className={mutedCls}> syncing…</em>}
              {row.status === 'failed' && row.error && (
                <>
                  <em className={errorCls}>{row.error}</em>
                  {row.retry && (
                    <button
                      type="button"
                      className={linkBtnCls}
                      onClick={event => {
                        const input = event.currentTarget
                          .closest('li')
                          ?.querySelector('input') as HTMLInputElement | null;
                        const retryText = input?.value.trim();
                        if (!retryText) return;

                        void row.retry?.(retryText);
                      }}
                    >
                      Retry
                    </button>
                  )}
                </>
              )}
              {(row.status === 'ok' || row.status === 'failed') && (
                <button
                  type="button"
                  className={linkBtnCls}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(comment.id)}
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <form className={formCls} onSubmit={submit}>
        <input
          className={formInputCls}
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="Add comment (empty → 422, prefix fail → retry, or enable chaos)…"
        />
        <button type="submit" className={actionBtnCls} disabled={add.isPending}>
          {add.isPending ? 'Sending…' : 'Add'}
        </button>
      </form>
    </section>
  );
}
