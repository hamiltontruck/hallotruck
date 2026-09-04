import { createClient } from '@supabase/supabase-js';
import './portal-enhancements.css';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storageKey: 'hallo-driver-mobile-v4-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

const portalLogo = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4MDAgMzYwIiByb2xlPSJpbWciIGFyaWEtbGFiZWw9IkhBTExPIFNtYXJ0IExvZ2lzdGljcyI+CjxyZWN0IHdpZHRoPSI4MDAiIGhlaWdodD0iMzYwIiBmaWxsPSJ3aGl0ZSIvPgo8dGV4dCB4PSI1NSIgeT0iMTkwIiBmb250LWZhbWlseT0iQXJpYWwsSGVsdmV0aWNhLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTUwIiBmb250LXdlaWdodD0iODAwIiBmaWxsPSIjMEIzRTlCIj5IQUw8L3RleHQ+CjxwYXRoIGQ9Ik01OTAgNTVjLTY1IDAtMTE4IDUzLTExOCAxMTggMCA4OCAxMTggMTYyIDExOCAxNjJzMTE4LTc0IDExOC0xNjJjMC02NS01My0xMTgtMTE4LTExOHptMCA2OGE1MCA1MCAwIDEgMSAwIDEwMCA1MCA1MCAwIDAgMSAwLTEwMHoiIGZpbGw9IiNGRkIwMDAiLz4KPHBhdGggZD0iTTYwIDI0NWMxNzAtNzIgMzUwLTM0IDUwMC0yNCA5NiA3IDE1MS01IDE5Ni0zNS0yNCA2Mi0xMDUgNzgtMTk3IDcwLTE3NC0xNS0zMzEtNDYtNDk5IDE0eiIgZmlsbD0iIzBCM0U5QiIvPgo8dGV4dCB4PSIxOTUiIHk9IjMzMCIgZm9udC1mYW1pbHk9IkFyaWFsLEhlbHZldGljYSxzYW5zLXNlcmlmIiBmb250LXNpemU9IjU4IiBmb250LXdlaWdodD0iNjAwIiBmaWxsPSIjMEIzRTlCIj5TbWFydCBMb2dpc3RpY3M8L3RleHQ+Cjwvc3ZnPg==';

type TripRow = {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string | null;
  distance_km: number | string | null;
  price_etb: number | string | null;
  accepted_at: string | null;
  delivered_at: string | null;
};

const money = (value: number | string | null) => `ETB ${Math.round(Number(value || 0)).toLocaleString()}`;
const when = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

function installPortalLogo() {
  document.querySelectorAll<HTMLElement>('.mark').forEach((mark) => {
    if (mark.dataset.portalLogo === '1') return;
    mark.dataset.portalLogo = '1';
    mark.textContent = '';
    mark.classList.add('portal-logo-mark');
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', 'HALLO Smart Logistics');
    mark.style.backgroundImage = `url("${portalLogo}")`;
  });
}

async function renderTripHistory() {
  const walletHero = document.querySelector<HTMLElement>('.wallet-hero');
  if (!walletHero || document.querySelector('#driver-v4-trip-history')) return;

  const host = document.createElement('section');
  host.id = 'driver-v4-trip-history';
  host.className = 'trip-history-v4';
  host.innerHTML = '<div class="trip-history-head"><div><small>TRIP ACTIVITY</small><h2>Trip History</h2><p>Your completed HALLO deliveries.</p></div></div><div class="trip-history-loading">Loading completed trips…</div>';
  const ledger = walletHero.parentElement?.querySelector('.ledger');
  if (ledger) ledger.insertAdjacentElement('afterend', host); else walletHero.insertAdjacentElement('afterend', host);

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    host.innerHTML += '<div class="trip-history-empty">Sign in again to load trip history.</div>';
    host.querySelector('.trip-history-loading')?.remove();
    return;
  }

  const { data, error } = await supabase
    .from('orders')
    .select('id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,accepted_at,delivered_at')
    .eq('driver_id', auth.user.id)
    .eq('status', 'delivered')
    .order('delivered_at', { ascending: false });

  host.querySelector('.trip-history-loading')?.remove();
  if (error) {
    const box = document.createElement('div');
    box.className = 'trip-history-empty';
    box.textContent = `Could not load trip history: ${error.message}`;
    host.appendChild(box);
    return;
  }

  const trips = (data || []) as TripRow[];
  const count = document.createElement('span');
  count.className = 'trip-history-count';
  count.textContent = `${trips.length} completed`;
  host.querySelector('.trip-history-head')?.appendChild(count);

  if (!trips.length) {
    host.insertAdjacentHTML('beforeend', '<div class="trip-history-empty">No completed trips yet. Delivered trips will appear here automatically.</div>');
    return;
  }

  const list = document.createElement('div');
  list.className = 'trip-history-list';
  trips.forEach((trip) => {
    const card = document.createElement('article');
    card.className = 'trip-history-card';
    const route = document.createElement('div');
    route.className = 'trip-history-route';
    const title = document.createElement('strong');
    title.textContent = trip.tracking_id;
    const status = document.createElement('span');
    status.textContent = 'Delivered';
    route.append(title, status);
    const places = document.createElement('p');
    places.textContent = `${trip.pickup_address} → ${trip.dropoff_address}`;
    const meta = document.createElement('div');
    meta.className = 'trip-history-meta';
    [
      ['Delivered', when(trip.delivered_at)],
      ['Vehicle', trip.vehicle_type || '—'],
      ['Distance', Number(trip.distance_km || 0) > 0 ? `${Number(trip.distance_km).toLocaleString()} km` : '—'],
      ['Trip amount', money(trip.price_etb)],
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      const small = document.createElement('small');
      const b = document.createElement('b');
      small.textContent = label;
      b.textContent = value;
      item.append(small, b);
      meta.appendChild(item);
    });
    card.append(route, places, meta);
    list.appendChild(card);
  });
  host.appendChild(list);
}

let scheduled = false;
function enhance() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    installPortalLogo();
    void renderTripHistory();
  });
}

new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('focus', enhance);
enhance();
