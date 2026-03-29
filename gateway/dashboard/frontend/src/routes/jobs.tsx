import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/jobs')({
  component: JobsPage,
});

function JobsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Jobs</h2>
      <p className="mt-1 text-sm text-gray-500">Track job execution and history.</p>
    </div>
  );
}
