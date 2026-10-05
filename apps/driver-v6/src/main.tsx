import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from '../pages/_index';
import DriverLogin from '../pages/login';
import Jobs from '../pages/jobs';
import Trip from '../pages/trip';
import CompleteTrip from '../pages/complete-trip';
import Wallet from '../pages/wallet';
import Profile from '../pages/profile';
import './styles.css';
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={client}><BrowserRouter><Routes>
    <Route path="/" element={<Home />} /><Route path="/login" element={<DriverLogin />} />
    <Route path="/jobs" element={<Jobs />} /><Route path="/trip" element={<Trip />} />
    <Route path="/complete-trip" element={<CompleteTrip />} /><Route path="/wallet" element={<Wallet />} /><Route path="/profile" element={<Profile />} />
    <Route path="*" element={<Home />} />
  </Routes></BrowserRouter></QueryClientProvider></React.StrictMode>,
);
