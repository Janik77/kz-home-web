import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { DraftGuardContext } from './draft-guard-context';
import { Button } from '../components/ui/button';

function LeaveDialog({ stay, discard, pending }: { stay: () => void; discard: () => void; pending: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal(); stayRef.current?.focus();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="draft-dialog" aria-labelledby="draft-dialog-title" aria-describedby="draft-dialog-description" onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={event => { event.preventDefault(); stay(); }}>
    <h2 id="draft-dialog-title">Есть несохранённые изменения</h2>
    <p id="draft-dialog-description">Останьтесь, чтобы продолжить редактирование. Если продолжить переход или отмену, черновик будет удалён из памяти.</p>
    {pending && <p>Запрос сохранения ещё выполняется. Уход не отменяет запись, которую Core уже мог принять. Проверьте данные после возвращения.</p>}
    <div className="definition-buttons"><button ref={stayRef} type="button" className="button button--primary" onClick={stay}>Остаться</button>
      <Button variant="secondary" onClick={discard}>Отменить изменения и продолжить</Button></div>
  </dialog>;
}

export function DraftGuard({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, { dirty: boolean; pending: boolean }>>({});
  const [discardRequest, setDiscardRequest] = useState<{ action: () => void } | null>(null);
  const register = useCallback((id: string, dirty: boolean, pending: boolean) => {
    setDrafts(previous => previous[id]?.dirty === dirty && previous[id]?.pending === pending ? previous : { ...previous, [id]: { dirty, pending } });
  }, []);
  const remove = useCallback((id: string) => setDrafts(previous => {
    if (!(id in previous)) return previous;
    const next = { ...previous }; delete next[id]; return next;
  }), []);
  const confirmDiscard = useCallback((action: () => void, dirty: boolean) => {
    if (dirty) setDiscardRequest({ action }); else action();
  }, []);
  const dirty = Object.values(drafts).some(draft => draft.dirty || draft.pending);
  const pending = Object.values(drafts).some(draft => draft.pending);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (!dirty && blocker.state === 'blocked') blocker.reset(); }, [dirty, blocker]);
  return <DraftGuardContext value={{ register, remove, confirmDiscard }}>{children}
    {(blocker.state === 'blocked' || discardRequest) && <LeaveDialog pending={pending}
      stay={() => { if (blocker.state === 'blocked') blocker.reset(); setDiscardRequest(null); }}
      discard={() => {
        if (blocker.state === 'blocked') blocker.proceed();
        else discardRequest?.action();
        setDiscardRequest(null);
      }} />}
  </DraftGuardContext>;
}
