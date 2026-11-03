import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import BusinessFeaturesPage from './BusinessFeaturesPage';

describe('BusinessFeaturesPage', () => {
  it('shows the shared core and previews restaurant and wholesale extensions', () => {
    render(<BusinessFeaturesPage />);
    expect(screen.getByText('Shared core')).toBeTruthy();
    expect(screen.getByText('Preview only · not saved')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Restaurant' }));
    expect(screen.getByText('Kitchen tickets')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Wholesale' }));
    expect(screen.getByText('Bulk price tiers')).toBeTruthy();
    expect(screen.getByText(/does not change company settings/)).toBeTruthy();
  });
});
