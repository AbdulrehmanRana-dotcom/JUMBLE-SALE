import { QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/Toast';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from './AuthProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

