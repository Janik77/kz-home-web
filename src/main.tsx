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
import { parseEnvironment } from './config/environment';
import { createServices } from './data/create-services';
import { CoreWorkspace } from './app/core-workspace';
import { StatePanel } from './components/ui/state-panel';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false }, mutations: { retry: false } } });
function configure() {
  try { return { services: createServices(parseEnvironment(import.meta.env)) }; }
  catch (error) { return { error: error instanceof Error ? error.message : 'Check frontend configuration.' }; }
}
const configuration = configure();
const root = document.getElementById('root');
if (!root) throw new Error('KZ Home root element is missing.');

createRoot(root).render(<StrictMode><ErrorBoundary><ThemeProvider><QueryClientProvider client={queryClient}>
  {configuration.services ? configuration.services.mode === 'mock'
    ? <RepositoryProvider value={configuration.services.repository}><App /></RepositoryProvider>
    : <CoreWorkspace services={configuration.services} />
    : <main className="session-page"><StatePanel kind="error" title="Connection configuration needs attention" description={configuration.error} /></main>}
</QueryClientProvider></ThemeProvider></ErrorBoundary></StrictMode>);
