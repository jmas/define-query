import { memo } from 'react';

type Props = {
  active: boolean;
  label?: string;
};

export const RefetchIndicator = memo(function RefetchIndicator({
  active,
  label = 'Refetching',
}: Props) {
  return (
    <>
      <div
        className={`card-loading-edge${active ? ' is-active' : ''}`}
        aria-hidden={!active}
      >
        <div className="card-loading-edge__ring" />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {active ? `${label}…` : ''}
      </span>
    </>
  );
});
