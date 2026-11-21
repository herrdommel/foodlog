import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Allergen,
  AuthConfig,
  EntryDto,
  EntryInput,
  IngredientDto,
  MeResponse,
  TemplateDto,
} from '@foodlog/shared';
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

export function useEntries(date: string) {
  return useQuery({
    queryKey: ['entries', date],
    queryFn: () => api<EntryDto[]>(`/api/entries?date=${date}`),
  });
}

function useEntryMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entries'] }),
  });
}

export function useCreateEntry() {
  return useEntryMutation((body: EntryInput) => api<EntryDto>('/api/entries', { body }));
}

export function useUpdateEntry() {
  return useEntryMutation(({ id, body }: { id: string; body: EntryInput }) =>
    api<EntryDto>(`/api/entries/${id}`, { method: 'PUT', body }),
  );
}

export function useDeleteEntry() {
  return useEntryMutation((id: string) => api(`/api/entries/${id}`, { method: 'DELETE' }));
}

export function useIngredientSearch(query: string) {
  return useQuery({
    queryKey: ['ingredients', query],
    queryFn: () => api<IngredientDto[]>(`/api/ingredients?q=${encodeURIComponent(query)}&limit=8`),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; allergens: Allergen[] }) =>
      api<IngredientDto>('/api/ingredients', { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ingredients'] }),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api<TemplateDto[]>('/api/templates'),
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      type: TemplateDto['type'];
      title: string | null;
      ingredientIds: string[];
    }) => api<TemplateDto>('/api/templates', { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });
}
