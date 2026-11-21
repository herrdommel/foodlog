import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { useMe } from './api/hooks.ts';
import { AdminLayout } from './components/admin/AdminLayout.tsx';
import { AppLayout } from './components/Layout.tsx';
import { setLocale } from './i18n/index.ts';
import { AdminInvitesPage } from './pages/admin/AdminInvites.tsx';
import { AdminSettingsPage } from './pages/admin/AdminSettings.tsx';
import { AdminUserDetailPage } from './pages/admin/AdminUserDetail.tsx';
import { AdminUsersPage } from './pages/admin/AdminUsers.tsx';
import { AnalysisPage } from './pages/Analysis.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { IngredientsPage } from './pages/Ingredients.tsx';
import { LoginPage } from './pages/Login.tsx';
import { ProfilePage } from './pages/Profile.tsx';
import { ReportPage } from './pages/Report.tsx';
import { RegisterPage } from './pages/Register.tsx';
import {
  ConfirmEmailChangePage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/TokenPages.tsx';

function RequireAuth() {
  const { data: me, isPending } = useMe();
  if (isPending) return null;
  if (!me) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireAdmin() {
  const { data: me } = useMe();
  if (me?.user.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { data: me, isPending } = useMe();
  if (isPending) return null;
  if (me) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function AppRoutes() {
  const { data: me } = useMe();
  const locale = me?.user.locale;
  useEffect(() => {
    if (locale) setLocale(locale);
  }, [locale]);

  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/confirm-email" element={<ConfirmEmailChangePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/ingredients" element={<IngredientsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="users/:id" element={<AdminUserDetailPage />} />
              <Route path="invites" element={<AdminInvitesPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
