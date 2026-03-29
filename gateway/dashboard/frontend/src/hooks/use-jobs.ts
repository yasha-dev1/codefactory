import { useQuery } from '@tanstack/react-query';
import { fetchJobs } from '@/api/jobs';

export function useJobs(status?: string) {
  return useQuery({
    queryKey: ['jobs', status],
    queryFn: () => fetchJobs(status),
    refetchInterval: 10_000,
  });
}
