/** Polling adaptativo: refetcha mientras visible, pausa al perder foco. */
import { useQuery, type UseQueryOptions, type QueryKey } from "@tanstack/react-query";

interface PollOptions<T> extends Omit<UseQueryOptions<T>, "queryKey" | "queryFn"> {
  intervalMs: number;
}

export function usePoll<T>(
  key: QueryKey,
  fetcher: () => Promise<T>,
  options: PollOptions<T>,
) {
  const { intervalMs, ...rest } = options;
  return useQuery({
    queryKey: key,
    queryFn: fetcher,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
    staleTime: Math.floor(intervalMs / 2),
    ...rest,
  });
}
