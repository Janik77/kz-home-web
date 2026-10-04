import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/manrope';
import './styles/tokens.css';
import './styles/global.css';
import './styles/components.css';
import './styles/layout.css';
import { App } from './app/app';
import { RepositoryProvider } from './app/services';
import { ThemeProvider } from './app/theme-provider';
import { ErrorBoundary } from './app/error-boundary';
import { createMockHomeRepository } from './data/mock/mock-home-repository';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false }, mutations: { retry: false } } });
const repository = createMockHomeRepository();
const root = document.getElementById('root');
if (!root) throw new Error('KZ Home root element is missing.');

createRoot(root).render(<StrictMode><ErrorBoundary><ThemeProvider><QueryClientProvider client={queryClient}>
  <RepositoryProvider value={repository}><App /></RepositoryProvider>
</QueryClientProvider></ThemeProvider></ErrorBoundary></StrictMode>);
