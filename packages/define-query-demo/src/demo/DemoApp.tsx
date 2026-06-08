import { memo, useCallback, useState } from 'react';
import { mockLatencyMs } from './api';
import { PostPanel } from './panels/post/PostPanel';
import { TimelinePanel } from './panels/timeline/TimelinePanel';
import { demoGridCls } from './styles';

const LatencyControl = memo(function LatencyControl() {
  const [latency, setLatency] = useState(mockLatencyMs.value);

  return (
    <label className="grid min-w-[220px] gap-1.5 text-sm">
      <span>Mock latency (ms)</span>
      <input
        type="range"
        min={0}
        max={1500}
        step={50}
        value={latency}
        onChange={event => {
          const value = Number(event.target.value);
          setLatency(value);
          mockLatencyMs.value = value;
        }}
      />
      <output className="font-mono text-violet-600 dark:text-violet-400">{latency}ms</output>
    </label>
  );
});

export const DemoApp = memo(function DemoApp() {
  const [selectedId, setSelectedId] = useState<string | null>('1');
  const handleClose = useCallback(() => setSelectedId(null), []);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-12 pt-6 text-left">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="mb-2 text-[1.75rem] font-medium text-zinc-900 dark:text-zinc-100">
            Define Query demo
          </h1>
          <p className="m-0 max-w-[540px]">
            In-memory mock API on the frontend — no server, no Vite middleware.
            Queries + patch mutations + Suspense.
          </p>
        </div>
        <LatencyControl />
      </header>

      <div className={demoGridCls}>
        <TimelinePanel selectedId={selectedId} onSelect={setSelectedId} />
        <PostPanel postId={selectedId} onClose={handleClose} />
      </div>
    </div>
  );
});
