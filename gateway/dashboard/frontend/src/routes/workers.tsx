import { createFileRoute } from '@tanstack/react-router';
import { useWorkers } from '@/hooks/use-workers';
import { formatDistanceToNow } from 'date-fns';

export const Route = createFileRoute('/workers')({
  component: WorkersPage,
});

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: 'bg-green-100 text-green-700',
    offline: 'bg-gray-100 text-gray-600',
    busy: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  );
}

function WorkersPage() {
  const { data, isLoading, isError } = useWorkers();

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Workers</h2>
      <p className="mt-1 text-sm text-gray-500">View and manage worker instances.</p>

      {isLoading && <p className="mt-4 text-sm text-gray-400">Loading workers...</p>}
      {isError && <p className="mt-4 text-sm text-red-600">Failed to load workers.</p>}

      {data && data.items.length === 0 && (
        <p className="mt-4 text-sm text-gray-400">No workers registered.</p>
      )}

      {data && data.items.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Hostname
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Capabilities
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Last Heartbeat
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Current Job
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data.items.map((w) => (
                <tr key={w.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{w.hostname}</td>
                  <td className="px-4 py-3 text-sm">
                    <StatusBadge status={w.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {w.capabilities.join(', ') || '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDistanceToNow(new Date(w.last_heartbeat_at), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {w.current_run_id || '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
