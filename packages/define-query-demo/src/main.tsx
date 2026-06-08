import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DemoApp } from './demo/DemoApp';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

if (import.meta.env.DEV) {
  window.__TANSTACK_QUERY_CLIENT__ = queryClient;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DemoApp />
    </QueryClientProvider>
  </StrictMode>,
);
