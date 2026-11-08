import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 2 * 60 * 1000, // 2 minutes default cache for smooth instant tab switching
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false, // Prevents aggressive and laggy refetches on web
      refetchOnReconnect: false,
    },
  },
});
