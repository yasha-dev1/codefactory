import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/webhooks')({
  component: WebhooksPage,
});

function WebhooksPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Webhooks</h2>
      <p className="mt-1 text-sm text-gray-500">Configure and monitor webhook endpoints.</p>
    </div>
  );
}
