import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AI_CONSENT_VERSION, AI_PHOTO_CONSENT_VERSION, type LegalDoc } from '@foodlog/shared';
import type {
  AdminSettingsDto,
  AiModelsDto,
  AiPhotoResultDto,
  AiPreviewDto,
  AiProviderId,
  AiResultDto,
  AiSettingsDto,
  AdminUserDetailDto,
  AdminUsersPageDto,
  Allergen,
  AnalysisDto,
  AuditEntryDto,
  AuthConfig,
  CreatedInviteDto,
  CustomIngredientDto,
  EntryDto,
  EntryInput,
  IngredientDto,
  InviteDto,
  LoginResponse,
  MeResponse,
  PasskeyAddedDto,
  RecoveryCodesDto,
  TotpSetupDto,
  ProductLookupDto,
  ResetLinkDto,
  TemplateDto,
} from '@foodlog/shared';
import { assertPasskey, createPasskey } from '../lib/passkeys.ts';
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
    mutationFn: (body: { email: string; password: string }) =>
      api<LoginResponse>('/api/auth/login', { body }),
    onSuccess: (result) => {
      if ('user' in result) return queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}

function useSignedIn<TVariables>(mutationFn: (variables: TVariables) => Promise<LoginResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
}

export function useMfaCodeLogin(method: 'totp' | 'recovery') {
  return useSignedIn((code: string) =>
    api<LoginResponse>(`/api/auth/mfa/${method}`, { body: { code } }),
  );
}

export function useMfaPasskeyLogin() {
  return useSignedIn(async () => {
    const { options } = await api<{ options: Parameters<typeof assertPasskey>[0] }>(
      '/api/auth/mfa/passkey/options',
      { method: 'POST' },
    );
    const response = await assertPasskey(options);
    return api<LoginResponse>('/api/auth/mfa/passkey/verify', { body: { response } });
  });
}

export function usePasskeyLogin() {
  return useSignedIn(async () => {
    const { options } = await api<{ options: Parameters<typeof assertPasskey>[0] }>(
      '/api/auth/passkey/options',
      { method: 'POST' },
    );
    const response = await assertPasskey(options);
    return api<LoginResponse>('/api/auth/passkey/verify', { body: { response } });
  });
}

function useMfaMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
}

export function useTotpSetup() {
  return useMutation({
    mutationFn: () => api<TotpSetupDto>('/api/me/mfa/totp/setup', { method: 'POST' }),
  });
}

export function useTotpConfirm() {
  return useMfaMutation((body: { code: string; password?: string }) =>
    api<RecoveryCodesDto>('/api/me/mfa/totp/confirm', { body }),
  );
}

export function useTotpDisable() {
  return useMfaMutation((body: { password?: string }) =>
    api<void>('/api/me/mfa/totp/disable', { body: { ...body } }),
  );
}

export function useAddPasskey() {
  return useMfaMutation(async ({ name, password }: { name: string; password?: string }) => {
    const { options } = await api<{ options: Parameters<typeof createPasskey>[0] }>(
      '/api/me/mfa/passkeys/options',
      { body: { password } },
    );
    const response = await createPasskey(options);
    return api<PasskeyAddedDto>('/api/me/mfa/passkeys', { body: { name, response } });
  });
}

export function useRenamePasskey() {
  return useMfaMutation(({ id, name }: { id: string; name: string }) =>
    api<void>(`/api/me/mfa/passkeys/${id}`, { method: 'PATCH', body: { name } }),
  );
}

export function useRemovePasskey() {
  return useMfaMutation(({ id, password }: { id: string; password?: string }) =>
    api<void>(`/api/me/mfa/passkeys/${id}/delete`, { body: { password } }),
  );
}

export function useNewRecoveryCodes() {
  return useMfaMutation((body: { password?: string }) =>
    api<RecoveryCodesDto>('/api/me/mfa/recovery-codes', { body: { ...body } }),
  );
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
      acceptPrivacy: true;
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
    mutationFn: (token: string) =>
      api<{ status: 'email_changed' | 'verification_sent' }>('/api/me/email/confirm', {
        body: { token },
      }),
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

export function useIngredientSearch(
  query: string,
  options: { limit?: number; scope?: 'all' | 'catalog' } = {},
) {
  const { limit = 8, scope = 'all' } = options;
  return useQuery({
    queryKey: ['ingredients', 'search', query, limit, scope],
    queryFn: () =>
      api<IngredientDto[]>(
        `/api/ingredients?q=${encodeURIComponent(query)}&limit=${limit}&scope=${scope}`,
      ),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

const CATALOG_PAGE_SIZE = 50;

export function useCatalogIngredients(query: string) {
  return useInfiniteQuery({
    queryKey: ['ingredients', 'catalog', query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<IngredientDto[]>(
        `/api/ingredients?q=${encodeURIComponent(query)}&limit=${CATALOG_PAGE_SIZE}&offset=${pageParam}&scope=catalog`,
      ),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < CATALOG_PAGE_SIZE ? undefined : pages.length * CATALOG_PAGE_SIZE,
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

export function useLookupProduct() {
  return useMutation({
    mutationFn: (barcode: string) =>
      api<ProductLookupDto>(`/api/products/${encodeURIComponent(barcode)}`),
  });
}

export function useMyIngredients() {
  return useQuery({
    queryKey: ['ingredients', 'mine'],
    queryFn: () => api<CustomIngredientDto[]>('/api/ingredients/mine'),
  });
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; allergens?: Allergen[] } }) =>
      api<IngredientDto>(`/api/ingredients/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useDeleteIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/ingredients/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
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

export function useAnalysis(params: {
  from: string;
  to: string;
  window: number;
  outcome: string;
  minSeverity: number;
}) {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    window: String(params.window),
    outcome: params.outcome,
    minSeverity: String(params.minSeverity),
  });
  return useQuery({
    queryKey: ['analysis', query.toString()],
    queryFn: () => api<AnalysisDto>(`/api/analysis?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useAdminUsers(params: { q: string; page: number }) {
  const query = new URLSearchParams({ q: params.q, page: String(params.page), pageSize: '25' });
  return useQuery({
    queryKey: ['admin', 'users', query.toString()],
    queryFn: () => api<AdminUsersPageDto>(`/api/admin/users?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => api<AdminUserDetailDto>(`/api/admin/users/${id}`),
  });
}

function useAdminMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  options: { userId?: (variables: TVariables) => string } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result, variables) => {
      if (options.userId && result && typeof result === 'object' && 'features' in result) {
        queryClient.setQueryData(['admin', 'user', options.userId(variables)], result);
      }
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useUpdateAdminUser(id: string) {
  return useAdminMutation(
    (body: Partial<{ name: string; email: string; role: 'user' | 'admin'; active: boolean }>) =>
      api<AdminUserDetailDto>(`/api/admin/users/${id}`, { method: 'PATCH', body }),
    { userId: () => id },
  );
}

export function useAdminResetLink(id: string) {
  return useMutation({
    mutationFn: (delivery: 'email' | 'link') =>
      api<ResetLinkDto>(`/api/admin/users/${id}/reset-link`, { body: { delivery } }),
  });
}

export function useAdminMfaReset(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/api/admin/users/${id}/mfa-reset`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useSetUserFeature(id: string) {
  return useAdminMutation(
    ({ key, enabled }: { key: string; enabled: boolean | null }) =>
      api<AdminUserDetailDto>(`/api/admin/users/${id}/features/${key}`, {
        method: 'PUT',
        body: { enabled },
      }),
    { userId: () => id },
  );
}

export function useAdminInvites() {
  return useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: () => api<InviteDto[]>('/api/admin/invites'),
  });
}

export function useCreateInvite() {
  return useAdminMutation((body: { email?: string; sendMail: boolean; expiresInDays: number }) =>
    api<CreatedInviteDto>('/api/admin/invites', { body }),
  );
}

export function useRevokeInvite() {
  return useAdminMutation((id: string) => api(`/api/admin/invites/${id}`, { method: 'DELETE' }));
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api<AdminSettingsDto>('/api/admin/settings'),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { publicRegistration: boolean }) =>
      api<AdminSettingsDto>('/api/admin/settings', { method: 'PATCH', body }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'settings'], data);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
      void queryClient.invalidateQueries({ queryKey: ['auth-config'] });
    },
  });
}

export function useUpdateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      body,
    }: {
      key: string;
      body: Partial<{ enabled: boolean; defaultForUsers: boolean }>;
    }) => api<AdminSettingsDto>(`/api/admin/features/${key}`, { method: 'PUT', body }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'settings'], data);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
      void queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}

export function useAdminAudit() {
  return useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => api<AuditEntryDto[]>('/api/admin/audit?limit=30'),
  });
}

export const aiSettingsKey = ['ai', 'settings'] as const;

export function useAiSettings() {
  return useQuery({
    queryKey: aiSettingsKey,
    queryFn: () => api<AiSettingsDto>('/api/ai/settings'),
  });
}

function useAiSettingsMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<AiSettingsDto>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(aiSettingsKey, data);
      void queryClient.invalidateQueries({ queryKey: ['ai', 'models'] });
    },
  });
}

export function useSaveAiKey() {
  return useAiSettingsMutation(({ provider, apiKey }: { provider: AiProviderId; apiKey: string }) =>
    api<AiSettingsDto>(`/api/ai/keys/${provider}`, { method: 'PUT', body: { apiKey } }),
  );
}

export function useDeleteAiKey() {
  return useAiSettingsMutation((provider: AiProviderId) =>
    api<AiSettingsDto>(`/api/ai/keys/${provider}`, { method: 'DELETE' }),
  );
}

export function useUpdateAiSettings() {
  return useAiSettingsMutation(
    (body: Partial<{ provider: AiProviderId | null; model: string | null }>) =>
      api<AiSettingsDto>('/api/ai/settings', { method: 'PATCH', body }),
  );
}

export function useGiveAiConsent() {
  return useAiSettingsMutation(() =>
    api<AiSettingsDto>('/api/ai/consent', { body: { version: AI_CONSENT_VERSION } }),
  );
}

export function useWithdrawAiConsent() {
  return useAiSettingsMutation(() => api<AiSettingsDto>('/api/ai/consent', { method: 'DELETE' }));
}

export function useGiveAiPhotoConsent() {
  return useAiSettingsMutation(() =>
    api<AiSettingsDto>('/api/ai/photo-consent', { body: { version: AI_PHOTO_CONSENT_VERSION } }),
  );
}

export function useWithdrawAiPhotoConsent() {
  return useAiSettingsMutation(() =>
    api<AiSettingsDto>('/api/ai/photo-consent', { method: 'DELETE' }),
  );
}

export function useRecognizePhoto() {
  return useMutation({
    mutationFn: (photo: Blob) => {
      const formData = new FormData();
      formData.append('file', photo, 'photo.jpg');
      return api<AiPhotoResultDto>('/api/ai/photo', { formData });
    },
  });
}

export function useAiModels(provider: AiProviderId | null, enabled: boolean) {
  return useQuery({
    queryKey: ['ai', 'models', provider],
    queryFn: () => api<AiModelsDto>(`/api/ai/models?provider=${provider}`),
    enabled: enabled && provider !== null,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useAiPreview() {
  return useMutation({
    mutationFn: (body: Record<string, string | number>) =>
      api<AiPreviewDto>('/api/ai/preview', { body }),
  });
}

export function useAiAnalyze() {
  return useMutation({
    mutationFn: (body: Record<string, string | number>) =>
      api<AiResultDto>('/api/ai/analyze', { body }),
  });
}

export function useLegalDocument(doc: LegalDoc, language: string) {
  return useQuery({
    queryKey: ['legal', doc, language],
    queryFn: async () => {
      const fallback = language === 'de' ? 'en' : 'de';
      try {
        const primary = await api<{ markdown: string }>(`/api/legal/${doc}?lang=${language}`);
        return { markdown: primary.markdown, language };
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        const other = await api<{ markdown: string }>(`/api/legal/${doc}?lang=${fallback}`);
        return { markdown: other.markdown, language: fallback };
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { confirmEmail: string; password?: string }) =>
      api('/api/me/delete', { body }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(meKey, null);
    },
  });
}
