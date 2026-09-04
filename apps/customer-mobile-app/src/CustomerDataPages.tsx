import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  formatEtb,
  formatOrderStatus,
  loadCustomerMobileData,
  type CustomerMobileData,
  type CustomerMobileOrder,
} from "./customer-data.service";
import { customerSupabase } from "./auth/customer-supabase";

type DataState =
  | { kind: "loading" }
  | { kind: "ready"; data: CustomerMobileData }
  | { kind: "error"; message: string };

const pageStyle = {
  minHeight: "100%",
  padding: "18px 16px 104px",
  background: "#f4f7fb",
  color: "#10213d",
} as const;

const cardStyle = {
  border: "1px solid #dfe7f1",
  borderRadius: "22px",
  background: "#fff",
  padding: "16px",
  boxShadow: "0 10px 30px rgba(16,33,61,.06)",
} as const;

function HaloHeader({ right }: { right: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
      <div>
        <div style={{ color: "#10213d", fontWeight: 950, fontSize: 23, letterSpacing: "-.045em" }}>HALLO<span style={{ color: "#d68e25" }}>TRUCK</span></div>
        <div style={{ marginTop: 2, color: "#68778d", fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".09em" }}>Customer Mobile</div>
      </div>
      <span style={{ borderRadius: 999, background: "#fff7e8", padding: "7px 10px", color: "#9a6700", fontSize: 11, fontWeight: 900 }}>{right}</span>
    </header>
  );
}

function StatusCard({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <section style={{ ...cardStyle, marginTop: 34, textAlign: "center", padding: "28px 20px" }}>
      <div style={{ width: 48, height: 48, margin: "0 auto", display: "grid", placeItems: "center", borderRadius: 16, background: "#fff7e8", color: "#9a6700", fontSize: 22, fontWeight: 950 }}>H</div>
      <h1 style={{ margin: "16px 0 0", fontSize: 22, lineHeight: 1.2 }}>{title}</h1>
      <p style={{ margin: "10px 0 0", color: "#68778d", fontSize: 13, lineHeight: 1.7 }}>{body}</p>
      {action && onAction && (
        <button type="button" onClick={onAction} style={{ marginTop: 18, minHeight: 46, width: "100%", border: 0, borderRadius: 15, background: "#10213d", color: "#fff", fontWeight: 900 }}>
          {action}
        </button>
      )}
    </section>
  );
}

function useCustomerData(userId: string) {
  const [state, setState] = useState<DataState>({ kind: "loading" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await loadCustomerMobileData(userId);
      setState({ kind: "ready", data });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Customer data could not be loaded.",
      });
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    void loadCustomerMobileData(userId)
      .then((data) => {
        if (active) setState({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Customer data could not be loaded.",
        });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return { state, reload };
}

function OrderCard({ order }: { order: CustomerMobileOrder }) {
  return (
    <article style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <small style={{ color: "#68778d", fontWeight: 850 }}>TRACKING</small>
          <strong style={{ display: "block", marginTop: 4, overflowWrap: "anywhere" }}>{order.tracking_id || "Pending tracking ID"}</strong>
        </div>
        <span style={{ flex: "0 0 auto", borderRadius: 999, background: "#fff7e8", padding: "6px 9px", color: "#9a6700", fontSize: 11, fontWeight: 900 }}>{formatOrderStatus(order.status)}</span>
      </div>
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <div><small style={{ color: "#68778d" }}>Pickup</small><strong style={{ display: "block", marginTop: 2 }}>{order.pickup_address || "Pickup pending"}</strong></div>
        <div><small style={{ color: "#68778d" }}>Drop-off</small><strong style={{ display: "block", marginTop: 2 }}>{order.dropoff_address || "Drop-off pending"}</strong></div>
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #edf1f6", display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: "#68778d", fontSize: 12 }}>{order.vehicle_type || "Vehicle pending"}{order.distance_km ? ` · ${Math.round(order.distance_km)} km` : ""}</span>
        <strong style={{ fontSize: 13 }}>{formatEtb(order.price_etb)}</strong>
      </div>
      <div style={{ marginTop: 10, color: "#68778d", fontSize: 11 }}>Payment: {formatOrderStatus(order.payment_status)}</div>
    </article>
  );
}

export function CustomerOrdersPage({ userId, onHome }: { userId: string; onHome: () => void }) {
  const { state, reload } = useCustomerData(userId);

  if (state.kind === "loading") {
    return <main style={pageStyle}><HaloHeader right="Secure DB"/><StatusCard title="Loading orders…" body="Your signed-in Customer orders are loading from the existing database."/></main>;
  }
  if (state.kind === "error") {
    return <main style={pageStyle}><HaloHeader right="Secure DB"/><StatusCard title="Orders could not be loaded" body={state.message} action="Try again" onAction={() => void reload()}/></main>;
  }
  if (!state.data.orders.length) {
    return <main style={pageStyle}><HaloHeader right="0 Orders"/><StatusCard title="No orders yet" body="No orders were found for this account. Start a new route from Home." action="Go to Home" onAction={onHome}/></main>;
  }

  return (
    <main style={pageStyle}>
      <HaloHeader right={`${state.data.orders.length} Orders`}/>
      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div><small style={{ color: "#9a6700", fontWeight: 900 }}>CUSTOMER ORDERS</small><h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Your shipments</h1></div>
        <button type="button" onClick={() => void reload()} style={{ border: "1px solid #d8e2ef", borderRadius: 12, background: "#fff", padding: "9px 11px", color: "#10213d", fontWeight: 850 }}>Refresh</button>
      </div>
      <section style={{ display: "grid", gap: 12 }}>
        {state.data.orders.map((order) => <OrderCard key={order.id} order={order}/>)}
      </section>
    </main>
  );
}

function ProfileRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(90px,.8fr) 1.2fr", gap: 14, padding: "13px 0", borderBottom: "1px solid #edf1f6" }}>
      <span style={{ color: "#68778d", fontSize: 12 }}>{label}</span>
      <strong style={{ textAlign: "right", overflowWrap: "anywhere", fontSize: 13 }}>{value?.trim() || "—"}</strong>
    </div>
  );
}

export function CustomerProfilePage({ userId }: { userId: string }) {
  const { state, reload } = useCustomerData(userId);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function signOutCustomer() {
    if (signingOut) return;
    const client = customerSupabase;
    if (!client) {
      setSignOutError("Customer session client is not configured.");
      return;
    }

    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Sign-out failed.");
    } finally {
      setSigningOut(false);
    }
  }

  if (state.kind === "loading") {
    return <main style={pageStyle}><HaloHeader right="Secure RPC"/><StatusCard title="Loading profile…" body="Your Customer profile is loading through the secure customer_get_profile RPC."/></main>;
  }
  if (state.kind === "error") {
    return <main style={pageStyle}><HaloHeader right="Secure RPC"/><StatusCard title="Profile could not be loaded" body={state.message} action="Try again" onAction={() => void reload()}/></main>;
  }
  if (!state.data.profile) {
    return <main style={pageStyle}><HaloHeader right="Secure RPC"/><StatusCard title="Customer profile not found" body="A session exists, but customer_get_profile returned no profile. No profile data is guessed."/></main>;
  }

  const profile = state.data.profile;
  const joined = profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—";
  return (
    <main style={pageStyle}>
      <HaloHeader right="Verified Customer"/>
      <section style={{ ...cardStyle, background: "linear-gradient(135deg,#10213d,#26364d)", color: "#fff", border: 0 }}>
        <div style={{ width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: 18, background: "rgba(245,180,0,.16)", color: "#f5b400", fontSize: 22, fontWeight: 950 }}>{(profile.full_name || "C").trim().slice(0, 1).toUpperCase()}</div>
        <small style={{ display: "block", marginTop: 16, color: "#f5b400", fontWeight: 850 }}>CUSTOMER PROFILE</small>
        <h1 style={{ margin: "5px 0 0", fontSize: 25 }}>{profile.full_name || "Customer"}</h1>
        <p style={{ margin: "7px 0 0", color: "rgba(255,255,255,.75)", fontSize: 12 }}>{profile.customer_type === "business" ? profile.company_name || "Business account" : "Individual account"}</p>
      </section>
      <section style={{ ...cardStyle, marginTop: 14 }}>
        <ProfileRow label="Phone" value={profile.phone}/>
        <ProfileRow label="Email" value={profile.email}/>
        <ProfileRow label="Home address" value={profile.home_address}/>
        <ProfileRow label="Account type" value={profile.customer_type}/>
        {profile.customer_type === "business" && <ProfileRow label="Company" value={profile.company_name}/>} 
        <ProfileRow label="Joined" value={joined}/>
      </section>
      <button type="button" onClick={() => void reload()} style={{ marginTop: 14, minHeight: 46, width: "100%", border: "1px solid #d8e2ef", borderRadius: 15, background: "#fff", color: "#10213d", fontWeight: 900 }}>Refresh profile</button>
      {signOutError && <p role="alert" style={{ margin: "12px 4px 0", color: "#b42318", fontSize: 11, fontWeight: 800 }}>{signOutError}</p>}
      <button type="button" onClick={() => void signOutCustomer()} disabled={signingOut} aria-busy={signingOut} style={{ marginTop: 10, minHeight: 46, width: "100%", border: "1px solid #f0c8c4", borderRadius: 15, background: "#fff", color: "#b42318", fontWeight: 900, opacity: signingOut ? .65 : 1 }}>
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
      <p style={{ margin: "14px 4px 0", color: "#68778d", fontSize: 11, lineHeight: 1.6 }}>Read-only: profile editing is not included. Data comes only from the existing Customer backend, RLS and secure RPC.</p>
    </main>
  );
}
