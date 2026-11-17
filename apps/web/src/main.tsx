import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/hebrew-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/hebrew-500.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/hebrew-600.css';
import './styles/base.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from './components/Toast';
import { createRouter } from './router';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={createRouter()} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
