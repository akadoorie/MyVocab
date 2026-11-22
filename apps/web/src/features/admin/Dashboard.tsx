import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { adminStrings as s } from '../../strings-admin';
import { adminApi } from './admin-api';
import { ErrorState, ghostButton, Loading, PageTitle } from './ui';

function Stat({ label, value, to }: { label: string; value: number; to?: string }) {
  const body = (
    <>
      <span className="text-3xl font-semibold">{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </>
  );
  const className = 'flex flex-col gap-1 rounded-[14px] border border-border bg-surface p-4';
  return to ? (
    <Link to={to} className={`${className} hover:border-accent`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** `/admin` (FR-A1). */
export function Dashboard() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminApi.stats });
  const languages = useQuery({ queryKey: ['admin', 'languages'], queryFn: adminApi.languages });
  if (stats.isError) return <ErrorState onRetry={() => void stats.refetch()} />;
  if (!stats.data) return <Loading />;
  const d = stats.data;
  const name = (code: string) =>
    languages.data?.languages.find((l) => l.code === code)?.name ?? code;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{s.dashboard.title}</PageTitle>
        <Link to="/admin/items/new" className={`${ghostButton} flex items-center`}>
          + {s.dashboard.newItem}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={s.dashboard.items} value={d.items.total} to="/admin/items" />
        <Stat label={s.dashboard.drafts} value={d.items.drafts} />
        {Object.entries(d.items.missingTranslation).map(([code, n]) => (
          <Stat key={code} label={s.dashboard.missingTranslation(name(code))} value={n} />
        ))}
        <Stat label={s.dashboard.noExplanation} value={d.items.noExplanation} />
        <Stat label={s.dashboard.noHints} value={d.items.noHints} />
        <Stat label={s.dashboard.multipleMeanings} value={d.items.multipleMeanings} />
        <Stat label={s.dashboard.sampleSet} value={d.items.sampleSet} to="/admin/items" />
        <Stat label={s.dashboard.users} value={d.users.total} to="/admin/users" />
        <Stat label={s.dashboard.admins} value={d.users.admins} />
        <Stat label={s.dashboard.trash} value={d.trash} to="/admin/trash" />
        <Stat label={s.dashboard.limitEvents} value={d.limitEvents24h} to="/admin/audit" />
      </div>
      <section className="rounded-[14px] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">{s.dashboard.sampleByDirection}</h2>
        <p className="mt-1 mb-3 text-sm text-muted">{s.dashboard.sampleByDirectionHelp}</p>
        <ul className="grid max-w-sm gap-2">
          {d.items.sampleByDirection.map((row) => (
            <li key={`${row.source}-${row.target}`} className="flex justify-between gap-3 text-sm">
              <span>
                {name(row.source)} → {name(row.target)}
              </span>
              <span className={`font-semibold ${row.count < 5 ? 'text-dontknow' : ''}`}>
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {d.items.byLang.length > 0 && (
        <section className="rounded-[14px] border border-border bg-surface p-5">
          <h2 className="mb-3 text-lg font-semibold">{s.dashboard.byLanguage}</h2>
          <ul className="grid max-w-sm gap-2">
            {d.items.byLang.map((row) => (
              <li key={row.lang} className="flex justify-between gap-3 text-sm">
                <span>{name(row.lang)}</span>
                <span className="font-semibold">{row.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
