import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { memo, useEffect, useState } from 'react';
import { FeatureTag } from '../../components/FeatureTag';
import {
  postQuery,
  removePostMutation,
  renamePostMutation,
} from '../../queries';
import {
  bodyCls,
  dangerBtnCls,
  fieldCls,
  inputCls,
  metaCls,
  panelHeaderCls,
  panelTitleCls,
  postSuspenseContentCls,
  refetchDimCls,
} from '../../styles';

type Props = {
  postId: string;
  onDeleted: () => void;
};

const PostHeaderTags = memo(function PostHeaderTags() {
  return (
    <>
      <FeatureTag label="draft merge" />
      <FeatureTag label="staleTime refetch" />
      <FeatureTag label="removeQuery: true" />
    </>
  );
});

const PostRenameField = memo(function PostRenameField({
  postId,
  savedTitle,
}: {
  postId: string;
  savedTitle: string;
}) {
  const [title, setTitle] = useState(savedTitle);
  const rename = useMutation(renamePostMutation(postId));

  useEffect(() => {
    setTitle(savedTitle);
  }, [postId]);

  return (
    <label className={fieldCls}>
      <span>Rename (blur to save)</span>
      <input
        className={inputCls}
        value={title}
        disabled={rename.isPending}
        onChange={event => setTitle(event.target.value)}
        onBlur={() => {
          const nextTitle = title.trim();
          if (nextTitle && nextTitle !== savedTitle) rename.mutate(nextTitle);
        }}
      />
    </label>
  );
});

export const PostHeader = memo(function PostHeader({ postId, onDeleted }: Props) {
  const { data, isFetching } = useSuspenseQuery(postQuery(postId));
  const remove = useMutation({
    ...removePostMutation(postId),
    onSuccess: onDeleted,
  });

  return (
    <div className={`${postSuspenseContentCls}${isFetching ? ` ${refetchDimCls}` : ''}`}>
      <header className={panelHeaderCls}>
        <h2 className={panelTitleCls}>{data.title}</h2>
        <PostHeaderTags />
      </header>

      <p className={bodyCls}>{data.body}</p>
      <p className={metaCls}>{data.commentCount} comments in store</p>

      <PostRenameField postId={postId} savedTitle={data.title} />

      <button
        type="button"
        className={dangerBtnCls}
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
      >
        Delete post
      </button>
    </div>
  );
});
