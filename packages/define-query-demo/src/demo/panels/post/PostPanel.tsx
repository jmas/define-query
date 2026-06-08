import { useIsFetching } from '@tanstack/react-query';
import { Component, Suspense, memo, type ReactNode } from 'react';
import { postQuery } from '../../queries';
import { FeatureTag } from '../../components/FeatureTag';
import { RefetchIndicator } from '../../components/RefetchIndicator';
import { PostPanelSkeleton } from '../../components/Skeleton';
import {
    emptyCls,
    errorCls,
    linkBtnCls,
    mutedCls,
    panelHeaderCls,
    panelMainCls,
    panelTitleCls,
    postSuspenseContentCls,
} from '../../styles';
import { CommentsPanel } from './CommentsPanel';
import { PostHeader } from './PostHeader';

type Props = {
  postId: string | null;
  onClose: () => void;
};

type ErrorBoundaryProps = {
  postId: string;
  onClose: () => void;
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

class PostPanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.postId !== this.props.postId) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className={emptyCls}>
          <p className={errorCls}>
            {this.state.error.message === 'Post not found'
              ? 'This post was deleted or does not exist.'
              : this.state.error.message}
          </p>
          <button type="button" className={linkBtnCls} onClick={this.props.onClose}>
            Close
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export const PostPanel = memo(function PostPanel({ postId, onClose }: Props) {
  const fetchingCount = useIsFetching({
    queryKey: postId ? postQuery.key(postId) : ['post-panel-idle'],
    exact: true,
  });
  const isPostFetching = postId !== null && fetchingCount > 0;

  return (
    <section className={panelMainCls}>
      <RefetchIndicator active={isPostFetching} label="Updating" />
      <header className={panelHeaderCls}>
        <h2 className={panelTitleCls}>Post query</h2>
        <FeatureTag label="Suspense" />
        <button
          type="button"
          className={`${linkBtnCls}${postId ? '' : ' invisible pointer-events-none'}`}
          tabIndex={postId ? 0 : -1}
          aria-hidden={!postId}
          onClick={onClose}
        >
          Close
        </button>
      </header>

      {postId
        ? (
          <PostPanelErrorBoundary postId={postId} onClose={onClose}>
            <Suspense fallback={<PostPanelSkeleton />}>
              <PostHeader postId={postId} onDeleted={onClose} />
              <CommentsPanel postId={postId} />
            </Suspense>
          </PostPanelErrorBoundary>
        )
        : (
          <div className={`${postSuspenseContentCls} ${emptyCls}`}>
            <p className={mutedCls}>Select a post from the timeline.</p>
          </div>
        )}
    </section>
  );
});
