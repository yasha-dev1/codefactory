import { createFileRoute } from '@tanstack/react-router';
import { useHealth } from '@/hooks/use-health';

export const Route = createFileRoute('/')({
  component: DashboardHome,
});

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
