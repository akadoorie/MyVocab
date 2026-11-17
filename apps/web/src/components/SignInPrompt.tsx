import { startGoogleSignIn } from '../lib/session';
import { strings } from '../strings';
import { Button3D } from './Button3D';

/** Shown on pages that need a signed-in learner. */
export function SignInPrompt() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-[14px] border border-border bg-surface p-6 text-center">
      <h1 className="text-2xl font-semibold">{strings.auth.signInRequiredTitle}</h1>
      <p className="text-muted">{strings.auth.signInRequiredBody}</p>
      <Button3D size="lg" onClick={startGoogleSignIn}>
        {strings.nav.signIn}
      </Button3D>
    </section>
  );
}
