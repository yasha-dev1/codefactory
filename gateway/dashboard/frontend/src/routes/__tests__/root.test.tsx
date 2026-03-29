import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import the Route to get the component
import { Route as RootRoute } from '../__root';

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

describe('RootLayout', () => {
  it('renders all nav items', async () => {
    const component = RootRoute.options.component!;
    renderWithRouter(component as () => React.ReactElement);

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Workers')).toBeInTheDocument();
    expect(screen.getByText('Webhooks')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
  });

  it('renders the CodeFactory branding', async () => {
    const component = RootRoute.options.component!;
    renderWithRouter(component as () => React.ReactElement);

    expect(await screen.findByText('CodeFactory')).toBeInTheDocument();
    expect(screen.getByText('Gateway Dashboard')).toBeInTheDocument();
  });
});
