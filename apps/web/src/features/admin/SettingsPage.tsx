import type { Settings, SettingsUpdate } from '@myvocab/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { Button3D } from '../../components/Button3D';
import { useToast } from '../../components/Toast';
import { adminStrings as s } from '../../strings-admin';
import { adminApi, errorMessage, fieldErrors } from './admin-api';
import { ErrorState, inputClass, Loading, PageTitle } from './ui';

type Draft = Omit<Settings, 'practice.sizeOptions'> & { 'practice.sizeOptions': string };

const toDraft = (v: Settings): Draft => ({
  ...v,
  'practice.sizeOptions': v['practice.sizeOptions'].join(', '),
});

/** `/admin/settings` (PRD §7.7, FR-A50). The server validates the merged settings. */
export function SettingsPage() {
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings });
  const languages = useQuery({ queryKey: ['admin', 'languages'], queryFn: adminApi.languages });
  const topics = useQuery({ queryKey: ['admin', 'topics'], queryFn: adminApi.topics });
  if (settings.isError) return <ErrorState onRetry={() => void settings.refetch()} />;
  if (!settings.data || !languages.data || !topics.data) return <Loading />;
  return (
    <SettingsForm
      initial={settings.data}
      languages={languages.data.languages.filter((l) => l.isActive)}
      topics={topics.data.topics.filter((c) => c.isActive)}
    />
  );
}

function SettingsForm({
  initial,
  languages,
  topics,
}: {
  initial: Settings;
  languages: { code: string; name: string }[];
  topics: { id: number; name: string }[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [base, setBase] = useState<Settings>(initial);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const errors = fieldErrors(error);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    setError(null);
    const parsed: Settings = {
      ...draft,
      'practice.sizeOptions': draft['practice.sizeOptions']
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    };
    const patch: SettingsUpdate = {};
    for (const key of Object.keys(parsed) as (keyof Settings)[]) {
      if (JSON.stringify(parsed[key]) !== JSON.stringify(base[key]))
        Object.assign(patch, { [key]: parsed[key] });
    }
    try {
      const saved = await adminApi.saveSettings(patch);
      setBase(saved);
      setDraft(toDraft(saved));
      queryClient.setQueryData(['admin', 'settings'], saved);
      void queryClient.invalidateQueries({ queryKey: ['meta'] });
      toast.show({ message: s.settings.saved });
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  const label = (key: keyof Settings) => s.settings.labels[key] ?? key;
  const num = (key: keyof Draft) => (
    <NumberField
      id={key}
      label={label(key as keyof Settings)}
      error={errors[key]}
      value={draft[key] as number}
      onChange={(v) => set(key, v as never)}
      hint={(s.settings.hints as Partial<Record<keyof Draft, string>>)[key]}
    />
  );
  const bool = (key: keyof Draft) => (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        checked={draft[key] as boolean}
        onChange={(e) => set(key, e.target.checked as never)}
        className="h-5 w-5 accent-[var(--accent)]"
      />
      {label(key as keyof Settings)}
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{s.settings.title}</PageTitle>
      <Group title={s.settings.groups.defaults}>
        <SelectField
          id="defaults.sourceLang"
          label={label('defaults.sourceLang')}
          error={errors['defaults.sourceLang']}
          value={draft['defaults.sourceLang']}
          onChange={(v) => set('defaults.sourceLang', v)}
          options={languages.map((l) => [l.code, l.name])}
        />
        <SelectField
          id="defaults.targetLang"
          label={label('defaults.targetLang')}
          error={errors['defaults.targetLang']}
          value={draft['defaults.targetLang']}
          onChange={(v) => set('defaults.targetLang', v)}
          options={languages.map((l) => [l.code, l.name])}
        />
        <SelectField
          id="defaults.topicId"
          label={label('defaults.topicId')}
          error={errors['defaults.topicId']}
          value={draft['defaults.topicId'] === null ? '' : String(draft['defaults.topicId'])}
          onChange={(v) => set('defaults.topicId', v === '' ? null : Number(v))}
          options={[['', s.settings.general]]}
          group={{
            label: s.settings.topicsGroup,
            options: topics.map((c) => [String(c.id), c.name] as [string, string]),
          }}
        />
      </Group>
      <Group title={s.settings.groups.practices}>
        <TextField
          id="practice.sizeOptions"
          label={label('practice.sizeOptions')}
          error={errors['practice.sizeOptions']}
          value={draft['practice.sizeOptions']}
          onChange={(v) => set('practice.sizeOptions', v)}
        />
        {num('practice.defaultSize')}
        {num('practice.maxSize')}
        {num('practice.nextSeconds')}
        {num('practice.continueSeconds')}
        {num('undo.windowSeconds')}
      </Group>
      <Group title={s.settings.groups.guests}>
        {bool('guests.enabled')}
        {num('guests.practiceSize')}
        {num('guests.practicesPerHour')}
      </Group>
      <Group title={s.settings.groups.limits}>{num('users.cardsPerDay')}</Group>
      <Group title={s.settings.groups.home}>{num('stats.registeredUsersMin')}</Group>
      <Group title={s.settings.groups.maintenance}>
        {bool('maintenance.enabled')}
        <TextField
          id="maintenance.message"
          label={label('maintenance.message')}
          error={errors['maintenance.message']}
          value={draft['maintenance.message']}
          onChange={(v) => set('maintenance.message', v)}
          maxLength={280}
        />
      </Group>
      <Group title={s.settings.groups.trash}>{num('trash.retentionHours')}</Group>
      {error !== null && (
        <p role="alert" className="text-sm text-dontknow">
          {errorMessage(error, s.common.genericError)}
        </p>
      )}
      <div>
        <Button3D disabled={saving} onClick={() => void save()}>
          {saving ? s.common.saving : s.common.save}
        </Button3D>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-[14px] border border-border bg-surface p-5 md:grid-cols-2">
      <legend className="px-1 text-lg font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function useFieldId(name: string) {
  return `${useId()}-${name.replace(/\W/g, '')}`;
}

function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  error?: string | undefined;
  /** A short explanation under the field. */
  hint?: string | undefined;
}) {
  const fieldId = useFieldId(id);
  const hintId = `${fieldId}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm text-muted">
        {label}
      </label>
      <input
        autoComplete="off"
        id={fieldId}
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && <p className="text-sm text-dontknow">{error}</p>}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  maxLength?: number;
}) {
  const fieldId = useFieldId(id);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm text-muted">
        {label}
      </label>
      <input
        autoComplete="off"
        id={fieldId}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="text-sm text-dontknow">{error}</p>}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  group,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  /** More options under a heading, after the others (the real topics, D-040). */
  group?: { label: string; options: [string, string][] } | undefined;
  error?: string | undefined;
}) {
  const fieldId = useFieldId(id);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm text-muted">
        {label}
      </label>
      <select
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
        {group && group.options.length > 0 && (
          <optgroup label={group.label}>
            {group.options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {error && <p className="text-sm text-dontknow">{error}</p>}
    </div>
  );
}
