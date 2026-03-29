import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/workers')({
  component: WorkersPage,
});

function WorkersPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Workers</h2>
      <p className="mt-1 text-sm text-gray-500">View and manage worker instances.</p>
    </div>
  );
}
