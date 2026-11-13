import { useState, StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DraftGuard } from './draft-guard';
import { useDraftGuard } from './draft-guard-context';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); });
function Editor({ name }: { name: string }) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const discard = useDraftGuard(value !== '', pending);
  return <><label>{name}<input value={value} onChange={e => setValue(e.target.value)} /></label>
    <button onClick={() => setValue('')}>Save {name}</button><button onClick={() => discard(() => setValue(''))}>Cancel {name}</button>
    <button onClick={() => setPending(true)}>Pending {name}</button><button onClick={() => setPending(false)}>Finish {name}</button></>;
}
function setup() {
  const router = createMemoryRouter([{ element: <DraftGuard><Outlet /></DraftGuard>, children: [
    { path: '/', element: <><Editor name="First" /><Editor name="Second" /><Link to="/other">Other</Link></> },
    { path: '/other', element: <h1>Destination</h1> },
  ] }]);
  render(<StrictMode><RouterProvider router={router} /></StrictMode>);
  return router;
}
function unload() { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }
it('aggregates multiple drafts, blocks unload and resets only after all saves', async () => {
  setup(); expect(unload()).toBe(false);
  await userEvent.type(screen.getByLabelText('First'), 'one');
  await userEvent.type(screen.getByLabelText('Second'), 'two');
  expect(unload()).toBe(true);
  await userEvent.click(screen.getByText('Save First')); expect(unload()).toBe(true);
  await userEvent.click(screen.getByText('Other'));
  expect(screen.getByRole('dialog')).toBeVisible(); expect(screen.getByText('Остаться')).toHaveFocus();
  await userEvent.click(screen.getByText('Остаться'));
  expect(screen.getByLabelText('Second')).toHaveValue('two');
  await userEvent.click(screen.getByText('Save Second')); expect(unload()).toBe(false);
  await userEvent.click(screen.getByText('Other')); expect(await screen.findByText('Destination')).toBeVisible();
});
it('Escape cancels dismissal; explicit discard continues router navigation once', async () => {
  const router = setup(); await userEvent.type(screen.getByLabelText('First'), 'draft');
  await act(() => router.navigate('/other'));
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(screen.getByLabelText('First')).toHaveValue('draft');
  await act(() => router.navigate('/other'));
  await userEvent.click(screen.getByText('Отменить изменения и продолжить'));
  expect(await screen.findByText('Destination')).toBeVisible(); expect(unload()).toBe(false);
});
it('local cancel requires confirmation and does not discard another form', async () => {
  setup(); await userEvent.type(screen.getByLabelText('First'), 'one'); await userEvent.type(screen.getByLabelText('Second'), 'two');
  await userEvent.click(screen.getByText('Cancel First')); await userEvent.click(screen.getByText('Отменить изменения и продолжить'));
  expect(screen.getByLabelText('First')).toHaveValue(''); expect(screen.getByLabelText('Second')).toHaveValue('two'); expect(unload()).toBe(true);
});
it('pending operation warns, then verified completion cancels blocked navigation', async () => {
  setup(); await userEvent.click(screen.getByText('Pending First')); expect(unload()).toBe(true);
  await userEvent.click(screen.getByText('Other')); expect(screen.getByText(/Запрос сохранения ещё выполняется/)).toBeVisible();
  fireEvent.click(screen.getByText('Finish First'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByLabelText('First')).toBeVisible(); expect(unload()).toBe(false);
});
