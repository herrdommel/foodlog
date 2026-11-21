import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthConfig, MeResponse } from '@foodlog/shared';
import { api, ApiError } from './client.ts';

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return await api<MeResponse>('/api/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<AuthConfig>('/api/auth/config'),
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api('/api/auth/login', { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(meKey, null);
      queryClient.clear();
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: {
      name: string;
      email: string;
      password: string;
      locale: string;
      inviteToken?: string;
    }) => api('/api/auth/register', { body }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => api('/api/auth/resend-verification', { body: { email } }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api('/api/auth/forgot-password', { body: { email } }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      api('/api/auth/reset-password', { body }),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) => api('/api/auth/verify-email', { body: { token } }),
  });
}

export function useConfirmEmailChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api('/api/me/email/confirm', { body: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<{ name: string; avatar: string; locale: string; timezone: string }>,
    ) => api<MeResponse>('/api/me', { method: 'PATCH', body }),
    onSuccess: (data) => queryClient.setQueryData(meKey, data),
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api<MeResponse>('/api/me/avatar', { formData });
    },
    onSuccess: (data) => queryClient.setQueryData(meKey, data),
  });
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: (body: { newEmail: string; password?: string }) => api('/api/me/email', { body }),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: () => api('/api/me/password-reset', { method: 'POST' }),
  });
}
