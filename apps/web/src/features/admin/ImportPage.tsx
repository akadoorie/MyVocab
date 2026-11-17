import type { CsvIssueView, ImportReportView } from '@myvocab/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button3D } from '../../components/Button3D';
import { useToast } from '../../components/Toast';
import { adminStrings as s } from '../../strings-admin';
import { adminApi, errorMessage } from './admin-api';
import { PageTitle } from './ui';

/**
 * `/admin/import` (PRD §8.3, FR-A60–61): download the template, upload, dry run (counts, per-row
 * errors and warnings), then commit. Commit is offered only after a clean dry run of the same file
 * and options; the server refuses a file with errors anyway.
 */
export function ImportPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [createCategories, setCreateCategories] = useState(false);
  const [report, setReport] = useState<ImportReportView | null>(null);
  const [checked, setChecked] = useState<{ file: File; createCategories: boolean } | null>(null);
  const [busy, setBusy] = useState<'dry' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCommit =
    report !== null &&
    report.dryRun &&
    report.errors.length === 0 &&
    checked?.file === file &&
    checked?.createCategories === createCategories;

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(dryRun ? 'dry' : 'commit');
    setError(null);
    try {
      const result = await adminApi.importCsv(file, {
        dryRun,
        createMissingCategories: createCategories,
      });
      setReport(result);
      setChecked(dryRun ? { file, createCategories } : null);
      if (result.committed) {
        toast.show({ message: s.import.committed });
        void queryClient.invalidateQueries({ queryKey: ['admin'] });
        void queryClient.invalidateQueries({ queryKey: ['meta'] });
      }
    } catch (e) {
      setReport(null);
      setError(errorMessage(e, s.common.genericError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{s.import.title}</PageTitle>
      <p className="text-sm text-muted">{s.import.help}</p>
      <a href="/api/admin/import/template" download className="w-fit text-sm text-accent underline">
        {s.import.template}
      </a>

      <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileId} className="text-sm text-muted">
            {s.import.file}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReport(null);
              setError(null);
            }}
            className="text-sm file:mr-3 file:min-h-11 file:rounded-[10px] file:border file:border-border file:bg-surface-2 file:px-3 file:text-text"
          />
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={createCategories}
            onChange={(e) => setCreateCategories(e.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          {s.import.createCategories}
        </label>
        <div className="flex flex-wrap gap-3">
          <Button3D disabled={!file || busy !== null} onClick={() => void run(true)}>
            {busy === 'dry' ? s.import.checking : s.import.dryRun}
          </Button3D>
          <Button3D
            variant="know"
            disabled={!canCommit || busy !== null}
            onClick={() => void run(false)}
          >
            {busy === 'commit' ? s.import.committing : s.import.commit}
          </Button3D>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-dontknow">
          {error}
        </p>
      )}
      {report && <ReportView report={report} />}
    </div>
  );
}

function ReportView({ report }: { report: ImportReportView }) {
  return (
    <section
      aria-label={s.import.resultTitle}
      aria-live="polite"
      className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5"
    >
      <h2 className="text-lg font-semibold">
        {report.committed ? s.import.committed : s.import.dryRunTitle}
      </h2>
      {report.dryRun && (
        <p className={report.errors.length === 0 ? 'text-know' : 'text-dontknow'}>
          {report.errors.length === 0 ? s.import.readyToCommit : s.import.fixErrors}
        </p>
      )}
      {report.totals && (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(report.totals).map(([key, value]) => (
            <div key={key} className="rounded-[10px] bg-surface-2 p-3">
              <dt className="text-xs text-muted">{s.import.totals[key] ?? key}</dt>
              <dd className="text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {report.skippedConcurrent > 0 && (
        <p className="text-sm text-hint">{s.import.skippedConcurrent(report.skippedConcurrent)}</p>
      )}
      <Issues
        title={s.import.errors(report.errors.length)}
        issues={report.errors}
        tone="text-dontknow"
      />
      <Issues
        title={s.import.warnings(report.warnings.length)}
        issues={report.warnings}
        tone="text-hint"
      />
    </section>
  );
}

function Issues({ title, issues, tone }: { title: string; issues: CsvIssueView[]; tone: string }) {
  if (issues.length === 0) return null;
  return (
    <div>
      <h3 className={`mb-2 font-semibold ${tone}`}>{title}</h3>
      <div className="max-h-96 overflow-auto rounded-[10px] border border-border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface-2 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{s.import.row}</th>
              <th className="px-3 py-2 font-medium">{s.import.column}</th>
              <th className="px-3 py-2 font-medium">{s.import.message}</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, i) => (
              <tr key={`${issue.row}-${issue.column}-${i}`} className="border-t border-border">
                <td className="px-3 py-2 align-top">
                  {issue.row > 0 ? issue.row : s.import.fileLevel}
                </td>
                <td className="px-3 py-2 align-top font-mono text-xs">{issue.column}</td>
                <td className="px-3 py-2">{issue.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
