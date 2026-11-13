import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import type { CoreSession, SessionSnapshot } from '../../data/core/session';
import { Wordmark } from '../../components/brand/wordmark';
import { PageHeading } from '../../components/ui/page-heading';
import { Button } from '../../components/ui/button';
import { Feedback } from '../../components/ui/feedback';
import { ThemeToggle } from '../../components/ui/theme-toggle';

export function LoginPage({ session, snapshot }: { session: CoreSession; snapshot: SessionSnapshot }) {
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const main = useRef<HTMLElement>(null);
  useEffect(() => { document.title = 'KZ Home · Войти'; main.current?.querySelector('h1')?.focus(); }, []);
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
  return <main className="session-page session-page--login" ref={main}>
    <aside className="session-intro" aria-label="О вашем доме">
      <p className="eyebrow">ПРОСТРАНСТВО ДЛЯ ГЛАВНОГО</p><p className="session-intro__title">Дом.<br />В гармонии.</p>
      <div className="architecture-window" aria-hidden="true"><span /><span /><span /></div>
      <p className="session-intro__caption">Меньше забот.<br />Больше места для жизни.</p>
    </aside>
    <div className="session-card"><div className="session-card__brand"><Wordmark /><ThemeToggle /></div>
    <PageHeading eyebrow="ВАШЕ ПРОСТРАНСТВО" title="Вход в дом" description="Войдите, чтобы увидеть свой дом и доступные устройства." />
    {snapshot.message && <Feedback tone="error" message={snapshot.message} />}
    {busy && <Feedback tone="pending" message="Проверяем учётную запись…" />}
    <form className="login-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <label htmlFor="login-email">Электронная почта<input id="login-email" name="email" type="email" autoComplete="username" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
      <div className="login-field"><label htmlFor="login-password">Пароль</label><div className="password-field"><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} disabled={busy} /><button type="button" className="password-field__toggle" aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPassword} disabled={busy} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div></div>
      <Button type="submit" aria-disabled={busy}>{busy ? 'Входим…' : 'Войти'}</Button>
    </form>
    <div className="session-security"><LockKeyhole size={17} aria-hidden="true" /><p className="quiet-note">Сеанс хранится только в памяти вкладки. После перезагрузки потребуется повторный вход. Создание и восстановление учётной записи выполняются вне Web.</p></div>
  </div></main>;
}
