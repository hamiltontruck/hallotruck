import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase.client';
import type { HardwareGpsPosition } from '../domain/admin-hardware-gps';
export function useAdminHardwareGps(truckIds: string[]) {
  const key = [...new Set(truckIds)].slice(0, 20).join(',');
  const [state, setState] = useState<{ key: string; positions: HardwareGpsPosition[]; error: string }>({ key: '', positions: [], error: '' });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      if (!key) { setState({ key, positions: [], error: '' }); return; }
      try {
        const { data, error } = await supabase.functions.invoke('admin-hardware-gps', { body: { truckIds: key.split(',') } });
        if (cancelled) return;
        if (error || !Array.isArray(data?.positions)) throw new Error('Unavailable');
        setState({ key, positions: data.positions as HardwareGpsPosition[], error: '' });
      } catch { if (!cancelled) setState({ key, positions: [], error: 'Hardware GPS unavailable. Showing Driver app GPS where available.' }); }
      if (!cancelled) timer = setTimeout(() => void load(), 8000);
    }
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key]);
  return state.key === key ? state : { positions: [], error: '' };
}
