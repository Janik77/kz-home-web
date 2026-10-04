import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CoreSession, SessionSnapshot } from '../../data/core/session';
import { Wordmark } from '../../components/brand/wordmark';
import { PageHeading } from '../../components/ui/page-heading';
import { Button } from '../../components/ui/button';
import { Feedback } from '../../components/ui/feedback';

export function LoginPage({ session, snapshot }: { session: CoreSession; snapshot: SessionSnapshot }) {
  const [email, setEmail] = useState('');
  const main = useRef<HTMLElement>(null);
  useEffect(() => { document.title = 'KZ Home · Sign in'; main.current?.querySelector('h1')?.focus(); }, []);
  const busy = snapshot.status === 'authenticating';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = String(fields.get('password') ?? '');
    // Clear the uncontrolled field immediately; never put the password in React state.
    const input = form.elements.namedItem('password');
    if (input instanceof HTMLInputElement) input.value = '';
    await session.login(email, password);
  }
  return <main className="session-page" ref={main}><div className="session-card"><Wordmark />
    <PageHeading eyebrow="Core connection" title="Welcome home" description="Sign in with your KZ Home Core account. This connection is read only." />
    {snapshot.message && <Feedback tone="error" message={snapshot.message} />}
    {busy && <Feedback tone="pending" message="Verifying your account…" />}
    <form className="login-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <label htmlFor="login-email">Email<input id="login-email" name="email" type="email" autoComplete="username" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
      <label htmlFor="login-password">Password<input id="login-password" name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={busy} /></label>
      <Button type="submit" aria-disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form>
    <p className="quiet-note">Your session stays in this tab’s memory. Reloading requires signing in again. Account creation and recovery are managed outside Web.</p>
  </div></main>;
}
