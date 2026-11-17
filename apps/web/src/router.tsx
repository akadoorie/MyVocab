import { createBrowserRouter, Link } from 'react-router';
import { AccountPage } from './features/account/AccountPage';
import { KnownPage } from './features/known/KnownPage';
import { LoopPage } from './features/loop/LoopPage';
import { Landing } from './routes/Landing';
import { Layout } from './routes/Layout';
import { Privacy } from './routes/Privacy';
import { strings } from './strings';

function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-4 px-4"
    >
      <h1 className="text-2xl font-semibold">{strings.notFound.title}</h1>
      <Link to="/" className="text-accent">
        {strings.notFound.back}
      </Link>
    </main>
  );
}

export const routes = [
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Landing },
      { path: 'known', Component: KnownPage },
      { path: 'account', Component: AccountPage },
      { path: 'privacy', Component: Privacy },
      { path: '*', Component: NotFound },
    ],
  },
  { path: '/loop', Component: LoopPage },
  {
    // The admin bundle is lazy-loaded: learners never download it (PRD §7).
    path: '/admin/*',
    lazy: async () => ({ Component: (await import('./features/admin/AdminApp')).AdminApp }),
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
