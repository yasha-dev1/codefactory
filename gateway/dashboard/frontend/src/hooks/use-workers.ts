import { useQuery } from '@tanstack/react-query';
import { fetchWorkers } from '@/api/workers';

export function useWorkers() {
  return useQuery({
    queryKey: ['workers'],
    queryFn: fetchWorkers,
    refetchInterval: 10_000,
  });
}
