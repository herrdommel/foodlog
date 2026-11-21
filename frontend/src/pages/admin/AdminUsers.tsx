import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { AdminUserDto } from '@foodlog/shared';
import { useAdminUsers } from '../../api/hooks.ts';
import { Button, Card, ErrorMessage, Field } from '../../components/ui.tsx';
import { useDebounced } from '../../lib/useDebounced.ts';

export function UserStatus({ user }: { user: Pick<AdminUserDto, 'active' | 'emailVerified'> }) {
  const { t } = useTranslation();
  const key = !user.active ? 'inactive' : !user.emailVerified ? 'unverified' : 'active';
  const style =
    key === 'active'
      ? 'bg-accent/25 text-fg'
      : key === 'inactive'
        ? 'bg-coral/40 text-fg'
        : 'bg-fg/10 text-fg';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {t(`admin.statuses.${key}`)}
    </span>
  );
}

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(query.trim());
  const users = useAdminUsers({ q: debounced, page });
  const data = users.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card title={t('admin.users.title')}>
      <Field
        label={t('admin.users.search')}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
      <ErrorMessage error={users.error} />
      {data && (
        <p className="text-sm text-fg/75">{t('admin.users.total', { count: data.total })}</p>
      )}
      {data?.users.length === 0 && <p className="text-fg/75">{t('admin.users.empty')}</p>}
      {data && data.users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">{t('admin.users.title')}</caption>
            <thead>
              <tr className="border-b border-fg/20 text-fg/75">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('admin.users.name')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('admin.users.email')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('admin.users.role')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('admin.users.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id} className="border-b border-fg/10">
                  <th scope="row" className="py-2 pr-3 font-medium">
                    <Link
                      to={`/admin/users/${user.id}`}
                      aria-label={t('admin.users.open', { name: user.name })}
                      className="text-accent hover:underline"
                    >
                      {user.name}
                    </Link>
                  </th>
                  <td className="py-2 pr-3">{user.email}</td>
                  <td className="py-2 pr-3">{t(`admin.roles.${user.role}`)}</td>
                  <td className="py-2">
                    <UserStatus user={user} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && pages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t('admin.users.previous')}
          </Button>
          <span className="text-sm">{t('admin.users.page', { page, pages })}</span>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t('admin.users.next')}
          </Button>
        </div>
      )}
    </Card>
  );
}
