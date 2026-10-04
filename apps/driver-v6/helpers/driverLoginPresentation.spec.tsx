import React from 'react';
import { render, screen } from '@testing-library/react';
import DriverLogin from '../pages/login';

describe('Driver V6 full login presentation', () => {
  it('renders the approved HALLO driver login hierarchy', () => {
    render(<DriverLogin />);
    expect(screen.getByRole('heading', { name: 'Welcome Drivers' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
    expect(screen.getByText('Secure Login')).toBeTruthy();
    expect(screen.getByText('Fast Payouts')).toBeTruthy();
    expect(screen.getByText('Live Tracking')).toBeTruthy();
    expect(screen.getByText('24/7 Support')).toBeTruthy();
  });
});
