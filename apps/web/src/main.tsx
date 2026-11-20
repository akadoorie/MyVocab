// Rubik, every subset it has (Latin, Hebrew, Arabic, Cyrillic) (D-027). The per-weight files give
// each subset a unicode-range, so the browser downloads only the subsets a page actually shows
// (the single-subset files have no range, so every one of them would be downloaded).
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import './styles/base.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from './components/Toast';
import { KnownQueueProvider } from './features/known/KnownQueueProvider';
import { installStaleBuildReload } from './lib/stale-build';
import { createRouter } from './router';

// After a deploy, an old tab reloads itself once instead of showing a load error.
installStaleBuildReload();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <KnownQueueProvider>
        <ToastProvider>
          <RouterProvider router={createRouter()} />
        </ToastProvider>
      </KnownQueueProvider>
    </QueryClientProvider>
  </StrictMode>,
);
