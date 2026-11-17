import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { useSession } from '../../lib/session';
import { adminStrings as s } from '../../strings-admin';
import { AuditPage } from './AuditPage';
import { CategoriesPage, LanguagesPage } from './CatalogPages';
import { Dashboard } from './Dashboard';
import { ItemEditorPage, NewItemPage } from './ItemEditor';
import { ItemsPage } from './ItemsPage';
import { SettingsPage } from './SettingsPage';
import { TrashPage } from './TrashPage';
import { Loading } from './ui';
import { UsersPage } from './UsersPage';

const NAV = [
  { to: '/admin', label: s.nav.dashboard, end: true },
  { to: '/admin/items', label: s.nav.items },
  { to: '/admin/trash', label: s.nav.trash },
  { to: '/admin/categories', label: s.nav.categories },
  { to: '/admin/languages', label: s.nav.languages },
  { to: '/admin/users', label: s.nav.users },
  { to: '/admin/settings', label: s.nav.settings },
  { to: '/admin/audit', label: s.nav.audit },
];

/**
 * The admin area (PRD §7, §9.7), lazy-loaded so learners never download it. Showing it only to
 * admins is cosmetic: every /api/admin call is checked by both locks on the server.
 */
export function AdminApp() {
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (session.loading) return <Loading />;
  if (session.user?.role !== 'admin') {
    return (
      <main
        id="main"
        className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center"
      >
        <h1 className="text-2xl font-semibold">{s.denied.title}</h1>
        <p className="text-muted">{s.denied.body}</p>
        <a href="/" className="text-accent">
          {s.nav.backToApp}
        </a>
      </main>
    );
  }

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center rounded-[10px] px-3 ${isActive ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`;
  const nav = (
    <nav aria-label={s.title} className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end ?? false}
          className={link}
          onClick={() => setMenuOpen(false)}
        >
          {item.label}
        </NavLink>
      ))}
      <a href="/" className="mt-4 flex min-h-11 items-center px-3 text-sm text-accent">
        ← {s.nav.backToApp}
      </a>
    </nav>
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col md:flex-row md:gap-6 md:px-4">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-surface focus:p-2"
      >
        Skip to content
      </a>
      <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
        <span className="font-semibold">
          My<span className="text-accent">Vocab</span> · {s.title}
        </span>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="admin-menu"
          onClick={() => setMenuOpen((v) => !v)}
          className="min-h-11 rounded-[10px] border border-border px-3"
        >
          {s.nav.menu}
        </button>
      </header>
      {menuOpen && (
        <div id="admin-menu" className="border-b border-border px-4 py-3 md:hidden">
          {nav}
        </div>
      )}
      <aside className="hidden w-56 shrink-0 py-6 md:block">
        <p className="mb-4 px-3 text-lg font-semibold">
          My<span className="text-accent">Vocab</span> · {s.title}
        </p>
        {nav}
      </aside>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 md:px-0">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="items/new" element={<NewItemPage />} />
          <Route path="items/:id" element={<ItemEditorPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="languages" element={<LanguagesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}
