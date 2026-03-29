import { createFileRoute } from '@tanstack/react-router';
import { useJobs } from '@/hooks/use-jobs';
import { formatDistanceToNow } from 'date-fns';

export const Route = createFileRoute('/jobs')({
  component: JobsPage,
});

function JobStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  );
}

function JobsPage() {
  const { data, isLoading, isError } = useJobs();

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Jobs</h2>
      <p className="mt-1 text-sm text-gray-500">Track job execution and history.</p>

      {isLoading && <p className="mt-4 text-sm text-gray-400">Loading jobs...</p>}
      {isError && <p className="mt-4 text-sm text-red-600">Failed to load jobs.</p>}

      {data && data.items.length === 0 && (
        <p className="mt-4 text-sm text-gray-400">No jobs yet.</p>
      )}

      {data && data.items.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Repo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Issue/PR
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Started
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data.items.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{j.workflow_type}</td>
                  <td className="px-4 py-3 text-sm">
                    <JobStatusBadge status={j.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{j.repo}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {j.issue_number
                      ? `#${j.issue_number}`
                      : j.pr_number
                        ? `PR #${j.pr_number}`
                        : '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDistanceToNow(new Date(j.started_at), { addSuffix: true })}
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
