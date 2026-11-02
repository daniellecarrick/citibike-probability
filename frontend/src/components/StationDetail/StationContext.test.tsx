import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypicalRange } from './TypicalRange';
import type { StationContext } from '../../types';

const context: StationContext = {
  station_id: 'A',
  capacity: 25,
  range: { metric: 'bikes', sample_count: 18, p10: 5.7, p25: 7.2, median: 11, p75: 11.8, p90: 15.6 },
};

describe('TypicalRange', () => {
  it('states the middle-half range at the selected time', () => {
    render(<TypicalRange context={context} selectedTime={510} />);
    expect(screen.getByText('7–12 bikes')).toBeInTheDocument();
    expect(screen.getByText(/at 8:30 AM/)).toBeInTheDocument();
    expect(screen.getByText('median 11')).toBeInTheDocument();
    expect(screen.getByText('25 docks')).toBeInTheDocument();
  });

  it('says so when there is no history', () => {
    render(<TypicalRange context={{ ...context, range: { ...context.range, sample_count: 0, p25: null, p75: null, median: null } }} selectedTime={510} />);
    expect(screen.getByText(/Not enough history at 8:30 AM/)).toBeInTheDocument();
  });
});
