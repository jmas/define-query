import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { memo } from 'react';
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
  const rename = useMutation(renamePostMutation(postId));

  return (
    <label className={fieldCls}>
      <span>Rename (blur to save)</span>
      <input
        key={savedTitle}
        className={inputCls}
        defaultValue={savedTitle}
        disabled={rename.isPending}
        onBlur={event => {
          const title = event.target.value.trim();
          if (title && title !== savedTitle) rename.mutate(title);
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
