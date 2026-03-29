import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/webhooks')({
  component: WebhooksPage,
});

function WebhooksPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Webhooks</h2>
      <p className="mt-1 text-sm text-gray-500">GitHub webhook event log.</p>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Event
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Repo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Received
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Job
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                No webhook events received yet. Configure your GitHub repository webhook to point at
                this gateway.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
