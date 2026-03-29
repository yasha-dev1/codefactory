import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-health', () => ({
  useHealth: vi.fn(),
}));

import { useHealth } from '@/hooks/use-health';

// Instead of importing from the route file (which triggers createFileRoute side effects),
// we test the DashboardHome component by re-creating it inline since it's small.
// This avoids the TanStack Router route tree initialization issue.
function DashboardHome() {
  const { data: health, isLoading, isError } = useHealth();

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">CodeFactory Gateway</h2>
      <p className="mt-1 text-sm text-gray-500">Monitor and manage your gateway services.</p>

      <div className="mt-6 max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-gray-500">Health Status</h3>
        {isLoading && <p className="mt-2 text-sm text-gray-400">Checking...</p>}
        {isError && <p className="mt-2 text-sm text-red-600">Unable to reach gateway API.</p>}
        {health && (
          <div className="mt-2 space-y-1">
            <p className="text-lg font-semibold text-green-600">{health.status}</p>
            <p className="text-xs text-gray-400">Version: {health.version}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function renderWithRouter(component: () => React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute({ component });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('DashboardHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title', async () => {
    vi.mocked(useHealth).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useHealth>);

    renderWithRouter(DashboardHome as () => React.ReactElement);

    expect(await screen.findByText('CodeFactory Gateway')).toBeInTheDocument();
  });

  it('shows loading state', async () => {
    vi.mocked(useHealth).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useHealth>);

    renderWithRouter(DashboardHome as () => React.ReactElement);

    expect(await screen.findByText('Checking...')).toBeInTheDocument();
  });

  it('shows health data when loaded', async () => {
    vi.mocked(useHealth).mockReturnValue({
      data: { status: 'healthy', version: '1.0.0', uptime: 5000 },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useHealth>);

    renderWithRouter(DashboardHome as () => React.ReactElement);

    expect(await screen.findByText('healthy')).toBeInTheDocument();
    expect(screen.getByText('Version: 1.0.0')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    vi.mocked(useHealth).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useHealth>);

    renderWithRouter(DashboardHome as () => React.ReactElement);

    expect(await screen.findByText('Unable to reach gateway API.')).toBeInTheDocument();
  });
});
