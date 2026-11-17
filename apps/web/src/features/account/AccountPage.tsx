import type { SessionUser } from '@myvocab/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button3D } from '../../components/Button3D';
import { SignInPrompt } from '../../components/SignInPrompt';
import { useToast } from '../../components/Toast';
import { Avatar } from '../../components/UserMenu';
import { api, ApiError } from '../../lib/api';
import { ME_QUERY_KEY, useSession } from '../../lib/session';
import { removeKey } from '../../lib/storage';
import { strings } from '../../strings';
import { queueStorageKey } from '../known/known-queue';
import { useKnownQueue } from '../known/KnownQueueProvider';
import { useSignOut } from './useSignOut';

/** Account page (PRD FR-L70–71): profile, sign out, delete my account. */
export function AccountPage() {
  const session = useSession();
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-12">
      {session.loading ? (
        <div className="h-64 animate-pulse rounded-[14px] bg-surface" aria-busy="true" />
      ) : session.user ? (
        <Account user={session.user} />
      ) : (
        <SignInPrompt />
      )}
    </main>
  );
}

function Account({ user }: { user: SessionUser }) {
  const signOut = useSignOut();
  const queue = useKnownQueue();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const confirmId = useId();
  const [confirm, setConfirm] = useState('');

  const remove = useMutation({
    mutationFn: api.deleteMe,
    onSuccess: () => {
      queue?.stop();
      removeKey('local', queueStorageKey(user.id));
      queryClient.setQueryData(ME_QUERY_KEY, { user: null });
      queryClient.removeQueries({ queryKey: ['known'] });
      void queryClient.invalidateQueries({ queryKey: ['available'] });
      toast.show({ message: strings.account.deleted });
      navigate('/', { replace: true });
    },
  });
  const error =
    remove.error instanceof ApiError && remove.error.code === 'CONFLICT'
      ? remove.error.message
      : remove.error
        ? strings.account.deleteFailed
        : null;

  return (
    <div className="flex flex-col gap-6 pt-2">
      <h1 className="text-3xl font-semibold tracking-tight">{strings.account.title}</h1>

      <section className="flex items-center gap-4 rounded-[14px] border border-border bg-surface p-5">
        <Avatar user={user} size={56} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{user.name}</p>
          <p className="truncate text-muted">{user.email}</p>
          {(user.role === 'admin' || user.isOwner) && (
            <p className="mt-1 flex gap-2 text-xs">
              {user.role === 'admin' && (
                <span className="rounded-full border border-accent px-2 py-0.5 text-accent">
                  {strings.account.admin}
                </span>
              )}
              {user.isOwner && (
                <span className="rounded-full border border-hint px-2 py-0.5 text-hint">
                  {strings.account.owner}
                </span>
              )}
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby="signout-title"
        className="rounded-[14px] border border-border bg-surface p-5"
      >
        <h2 id="signout-title" className="text-lg font-semibold">
          {strings.account.signOutTitle}
        </h2>
        <p className="mt-1 text-muted">{strings.account.signOutBody}</p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 min-h-11 rounded-[10px] border border-border px-4 hover:border-accent"
        >
          {strings.nav.signOut}
        </button>
      </section>

      <section
        aria-labelledby="delete-title"
        className="rounded-[14px] border border-dontknow/50 bg-surface p-5"
      >
        <h2 id="delete-title" className="text-lg font-semibold text-dontknow">
          {strings.account.deleteTitle}
        </h2>
        <p className="mt-1 text-muted">{strings.account.deleteBody}</p>
        <label htmlFor={confirmId} className="mt-4 block text-sm text-muted">
          {strings.account.deleteConfirmLabel}
        </label>
        <input
          id={confirmId}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="mt-1.5 min-h-11 w-full max-w-xs rounded-[10px] border border-border bg-surface-2 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-dontknow"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-dontknow">
            {error}
          </p>
        )}
        <div className="mt-4">
          <Button3D
            variant="dontknow"
            disabled={confirm !== 'DELETE' || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? strings.account.deleting : strings.account.deleteButton}
          </Button3D>
        </div>
      </section>
    </div>
  );
}
