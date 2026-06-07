import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
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
import { CommentsPanel } from './CommentsPanel';

type Props = {
  postId: string;
  onDeleted: () => void;
};

export function PostHeader({ postId, onDeleted }: Props) {
  const { data, isFetching } = useSuspenseQuery(postQuery(postId));
  const rename = useMutation(renamePostMutation(postId));
  const remove = useMutation({
    ...removePostMutation(postId),
    onSuccess: onDeleted,
  });

  return (
    <div className={`${postSuspenseContentCls}${isFetching ? ` ${refetchDimCls}` : ''}`}>
      <header className={panelHeaderCls}>
        <h2 className={panelTitleCls}>{data.title}</h2>
        <FeatureTag label="optimistic merge" />
        <FeatureTag label="staleTime refetch" />
        <FeatureTag label="removes: true" />
      </header>

      <p className={bodyCls}>{data.body}</p>
      <p className={metaCls}>{data.commentCount} comments in store</p>

      <label className={fieldCls}>
        <span>Rename (blur to save)</span>
        <input
          className={inputCls}
          defaultValue={data.title}
          key={data.title}
          disabled={rename.isPending}
          onBlur={event => {
            const title = event.target.value.trim();
            if (title && title !== data.title) rename.mutate(title);
          }}
        />
      </label>

      <button
        type="button"
        className={dangerBtnCls}
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
      >
        Delete post
      </button>

      <CommentsPanel postId={postId} />
    </div>
  );
}
