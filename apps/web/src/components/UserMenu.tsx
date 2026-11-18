import type { SessionUser } from '@myvocab/contracts';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useSignOut } from '../features/account/useSignOut';
import { strings } from '../strings';

/** The user's Google picture, or their initial. */
export function Avatar({ user, size = 36 }: { user: SessionUser; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (user.image && !failed) {
    return (
      <img
        src={user.image}
        alt=""
        style={style}
        className="rounded-full object-cover"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="flex items-center justify-center rounded-full bg-surface-2 font-semibold text-accent"
    >
      {(user.name || user.email).slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Avatar button with a small disclosure menu (PRD FR-L70). */
export function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const signOut = useSignOut();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const itemClass =
    'flex min-h-11 w-full items-center rounded-[10px] px-3 text-left hover:bg-surface-2 focus-visible:bg-surface-2';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={strings.nav.accountMenu}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Avatar user={user} />
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 z-40 mt-2 w-64 rounded-[14px] border border-border bg-surface p-2 shadow-[var(--card-shadow)]"
        >
          <div className="border-b border-border px-3 pt-1 pb-3">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
          <nav aria-label={strings.nav.accountMenu} className="flex flex-col pt-2">
            <Link to="/" className={itemClass} onClick={close}>
              {strings.nav.home}
            </Link>
            <Link to="/known" className={itemClass} onClick={close}>
              {strings.nav.knownWords}
            </Link>
            <Link to="/account" className={itemClass} onClick={close}>
              {strings.nav.account}
            </Link>
            {user.role === 'admin' && (
              // Full-page navigation so Cloudflare Access can intercept it (PRD §13.4).
              <a href="/admin" className={itemClass}>
                {strings.nav.admin}
              </a>
            )}
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                close();
                void signOut();
              }}
            >
              {strings.nav.signOut}
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
