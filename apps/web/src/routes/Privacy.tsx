import { strings } from '../strings';

/** A minimal privacy page (PRD FR-L72). */
export function Privacy() {
  const p = strings.privacy;
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-12">
      <article className="flex flex-col gap-6 pt-2 leading-relaxed">
        <h1 className="text-3xl font-semibold tracking-tight">{p.title}</h1>
        <p className="text-muted">{p.intro}</p>
        <section>
          <h2 className="mb-2 text-lg font-semibold">{p.storedTitle}</h2>
          <ul className="list-disc space-y-1 ps-5 text-muted">
            {p.stored.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">{p.whyTitle}</h2>
          <p className="text-muted">{p.why}</p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">{p.notTitle}</h2>
          <p className="text-muted">{p.not}</p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">{p.deleteTitle}</h2>
          <p className="text-muted">{p.delete}</p>
        </section>
      </article>
    </main>
  );
}
