import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { initialHome } from '../../data/mock/fixtures';
import { AvailabilityNotice } from './availability-notice';

describe('home availability', () => {
  it('identifies partial availability and links to the affected room and device', async () => {
    render(<MemoryRouter><AvailabilityNotice devices={initialHome.devices} rooms={initialHome.rooms} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Your other devices are available');
    await userEvent.click(screen.getByText('View offline device'));
    expect(screen.getByRole('link')).toHaveAttribute('href', '/rooms/office#device-office-lamp');
  });

  it('explains when every device is unavailable', () => {
    render(<MemoryRouter><AvailabilityNotice devices={initialHome.devices.map((device) => ({ ...device, connection: 'offline' }))} rooms={initialHome.rooms} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('All devices are offline. Controls are unavailable');
  });

  it('does not show an offline notice for an empty home or online devices', () => {
    const view = render(<MemoryRouter><AvailabilityNotice devices={[]} rooms={[]} /></MemoryRouter>);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><AvailabilityNotice devices={initialHome.devices.filter((device) => device.connection === 'online')} rooms={initialHome.rooms} /></MemoryRouter>);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
