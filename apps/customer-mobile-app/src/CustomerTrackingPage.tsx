import { useCallback, useEffect, useState } from "react";
import {
  loadCustomerTrackingData,
  type CustomerLiveTrip,
  type CustomerTrackingAssignment,
  type CustomerTrackingData,
  type CustomerTrackingOrder,
} from "./customer-tracking.service";

type TrackingState =
  | { kind: "loading" }
  | { kind: "ready"; data: CustomerTrackingData }
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

function labelStatus(value: string | null | undefined) {
  const clean = value?.trim().replaceAll("_", " ") || "pending";
  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCoordinate(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(5);
}

function formatRecordedAt(value: string | null | undefined) {
  if (!value) return "Waiting for GPS update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function Header({ right }: { right: string }) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
      <div>
        <div style={{ color: "#0759c7", fontWeight: 950, fontSize: 24, letterSpacing: "-.04em" }}>HALO</div>
        <div style={{ marginTop: 2, color: "#68778d", fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".09em" }}>Live Tracking</div>
      </div>
      <span style={{ borderRadius: 999, background: "#eaf2ff", padding: "7px 10px", color: "#0759c7", fontSize: 11, fontWeight: 900 }}>{right}</span>
    </header>
  );
}

function EmptyState({ onHome }: { onHome: () => void }) {
  return (
    <main style={pageStyle}>
      <Header right="Secure RPC" />
      <section style={{ ...cardStyle, marginTop: 34, textAlign: "center", padding: "30px 20px" }}>
        <div style={{ width: 52, height: 52, display: "grid", placeItems: "center", margin: "0 auto", borderRadius: 18, background: "#edf5ff", color: "#0759c7", fontSize: 25 }}>⌖</div>
        <small style={{ display: "block", marginTop: 16, color: "#0759c7", fontWeight: 900 }}>LIVE TRACKING</small>
        <h1 style={{ margin: "6px 0 0", fontSize: 22 }}>Active trip hin jiru</h1>
        <p style={{ margin: "10px 0 0", color: "#68778d", fontSize: 13, lineHeight: 1.7 }}>Accepted ykn in-transit Customer order yeroo jiraatu qofa driver fi GPS data dhugaa as irratti mul'ata.</p>
        <button type="button" onClick={onHome} style={{ marginTop: 18, minHeight: 46, width: "100%", border: 0, borderRadius: 15, background: "#0759c7", color: "#fff", fontWeight: 900 }}>Home irraa jalqabi</button>
      </section>
    </main>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main style={pageStyle}>
      <Header right="Secure RPC" />
      <section style={{ ...cardStyle, marginTop: 34, textAlign: "center", padding: "28px 20px" }}>
        <small style={{ color: "#b42318", fontWeight: 900 }}>TRACKING ERROR</small>
        <h1 style={{ margin: "7px 0 0", fontSize: 22 }}>Live data fe'uun hin danda'amne</h1>
        <p role="alert" style={{ margin: "10px 0 0", color: "#68778d", fontSize: 13, lineHeight: 1.7, overflowWrap: "anywhere" }}>{message}</p>
        <button type="button" onClick={onRetry} style={{ marginTop: 18, minHeight: 46, width: "100%", border: 0, borderRadius: 15, background: "#0759c7", color: "#fff", fontWeight: 900 }}>Irra deebi'ii yaali</button>
      </section>
    </main>
  );
}

function RouteCard({ order }: { order: CustomerTrackingOrder }) {
  return (
    <section style={{ ...cardStyle, background: "linear-gradient(135deg,#0759c7,#083f8d)", color: "#fff", border: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <small style={{ color: "rgba(255,255,255,.7)", fontWeight: 850 }}>TRACKING</small>
          <strong style={{ display: "block", marginTop: 3, fontSize: 19, overflowWrap: "anywhere" }}>{order.tracking_id || "Tracking pending"}</strong>
        </div>
        <span style={{ flex: "0 0 auto", borderRadius: 999, background: "rgba(255,255,255,.15)", padding: "7px 10px", fontSize: 11, fontWeight: 900 }}>{labelStatus(order.status)}</span>
      </div>
      <div style={{ marginTop: 17, display: "grid", gap: 12 }}>
        <div><small style={{ color: "rgba(255,255,255,.65)" }}>Pickup</small><strong style={{ display: "block", marginTop: 3 }}>{order.pickup_address || "Pickup pending"}</strong></div>
        <div><small style={{ color: "rgba(255,255,255,.65)" }}>Drop-off</small><strong style={{ display: "block", marginTop: 3 }}>{order.dropoff_address || "Drop-off pending"}</strong></div>
      </div>
      <div style={{ marginTop: 16, paddingTop: 13, borderTop: "1px solid rgba(255,255,255,.16)", color: "rgba(255,255,255,.8)", fontSize: 12 }}>
        {order.vehicle_type || "Vehicle pending"}{order.distance_km ? ` · ${Math.round(order.distance_km)} km` : ""}
      </div>
    </section>
  );
}

function DriverCard({ assignment }: { assignment: CustomerTrackingAssignment | undefined }) {
  if (!assignment) {
    return (
      <section style={{ ...cardStyle, marginTop: 14 }}>
        <small style={{ color: "#0759c7", fontWeight: 900 }}>ASSIGNED DRIVER</small>
        <h2 style={{ margin: "7px 0 0", fontSize: 18 }}>Driver assignment eeggachaa jira</h2>
        <p style={{ margin: "8px 0 0", color: "#68778d", fontSize: 12, lineHeight: 1.6 }}>Fake driver hin agarsiifamu. Secure assignment RPC driver dhugaa deebisuun booda as irratti mul'ata.</p>
      </section>
    );
  }

  return (
    <section style={{ ...cardStyle, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <small style={{ color: "#0759c7", fontWeight: 900 }}>ASSIGNED DRIVER</small>
          <h2 style={{ margin: "5px 0 0", fontSize: 19 }}>{assignment.driver_name || "Assigned driver"}</h2>
          <p style={{ margin: "5px 0 0", color: "#68778d", fontSize: 12 }}>{assignment.driver_phone || "Phone unavailable"}</p>
        </div>
        <span style={{ borderRadius: 999, padding: "7px 10px", background: assignment.driver_verified ? "#ecfdf3" : "#fff7ed", color: assignment.driver_verified ? "#027a48" : "#b54708", fontSize: 10, fontWeight: 900 }}>{assignment.driver_verified ? "VERIFIED" : "CHECKING"}</span>
      </div>
      <div style={{ marginTop: 14, paddingTop: 13, borderTop: "1px solid #edf1f6", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><small style={{ color: "#68778d" }}>Truck</small><strong style={{ display: "block", marginTop: 3, fontSize: 13 }}>{assignment.vehicle_type || "—"}</strong></div>
        <div><small style={{ color: "#68778d" }}>Plate</small><strong style={{ display: "block", marginTop: 3, fontSize: 13 }}>{assignment.plate_number || "—"}</strong></div>
        <div><small style={{ color: "#68778d" }}>Capacity</small><strong style={{ display: "block", marginTop: 3, fontSize: 13 }}>{assignment.capacity_tons == null ? "—" : `${assignment.capacity_tons} Ton`}</strong></div>
        <div><small style={{ color: "#68778d" }}>Documents</small><strong style={{ display: "block", marginTop: 3, fontSize: 13 }}>{assignment.license_verified && assignment.national_id_verified ? "Verified" : "Partial"}</strong></div>
      </div>
    </section>
  );
}

function LivePositionCard({ trip }: { trip: CustomerLiveTrip | undefined }) {
  const hasGps = trip?.truck_lat != null && trip?.truck_lng != null;
  return (
    <section style={{ ...cardStyle, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div><small style={{ color: "#0759c7", fontWeight: 900 }}>LIVE GPS SNAPSHOT</small><h2 style={{ margin: "5px 0 0", fontSize: 19 }}>{hasGps ? "Truck location received" : "GPS update eeggachaa jira"}</h2></div>
        <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 999, background: hasGps ? "#12b76a" : "#f5b400", boxShadow: hasGps ? "0 0 0 6px rgba(18,183,106,.12)" : "0 0 0 6px rgba(245,180,0,.12)" }} />
      </div>

      <div style={{ marginTop: 15, borderRadius: 18, background: "linear-gradient(145deg,#eaf2ff,#f8fbff)", padding: 15 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><small style={{ color: "#68778d" }}>Truck latitude</small><strong style={{ display: "block", marginTop: 3 }}>{formatCoordinate(trip?.truck_lat)}</strong></div>
          <div><small style={{ color: "#68778d" }}>Truck longitude</small><strong style={{ display: "block", marginTop: 3 }}>{formatCoordinate(trip?.truck_lng)}</strong></div>
          <div><small style={{ color: "#68778d" }}>Speed</small><strong style={{ display: "block", marginTop: 3 }}>{trip?.speed_kmh == null ? "—" : `${Math.round(Number(trip.speed_kmh))} km/h`}</strong></div>
          <div><small style={{ color: "#68778d" }}>Heading</small><strong style={{ display: "block", marginTop: 3 }}>{trip?.heading == null ? "—" : `${Math.round(Number(trip.heading))}°`}</strong></div>
        </div>
        <div style={{ marginTop: 13, paddingTop: 12, borderTop: "1px solid #d8e5f5" }}><small style={{ color: "#68778d" }}>Last GPS record</small><strong style={{ display: "block", marginTop: 3, fontSize: 12 }}>{formatRecordedAt(trip?.recorded_at)}</strong></div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11 }}>
        <div style={{ borderRadius: 14, background: "#f8fafc", padding: 11 }}><span style={{ color: "#68778d" }}>Pickup GPS</span><strong style={{ display: "block", marginTop: 4 }}>{formatCoordinate(trip?.pickup_lat)}, {formatCoordinate(trip?.pickup_lng)}</strong></div>
        <div style={{ borderRadius: 14, background: "#f8fafc", padding: 11 }}><span style={{ color: "#68778d" }}>Drop-off GPS</span><strong style={{ display: "block", marginTop: 4 }}>{formatCoordinate(trip?.dropoff_lat)}, {formatCoordinate(trip?.dropoff_lng)}</strong></div>
      </div>
      <p style={{ margin: "12px 2px 0", color: "#68778d", fontSize: 10, lineHeight: 1.5 }}>ETA ykn route hin tilmaamamu. Kun existing secured live-trip RPC irraa dhufe GPS snapshot qofa dha.</p>
    </section>
  );
}

export function CustomerTrackingPage({ userId, onHome }: { userId: string; onHome: () => void }) {
  const [state, setState] = useState<TrackingState>({ kind: "loading" });
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  const reload = useCallback(async (showLoading = true) => {
    if (showLoading) setState({ kind: "loading" });
    try {
      const data = await loadCustomerTrackingData(userId);
      setState({ kind: "ready", data });
      setSelectedOrderId((current) => current && data.orders.some((order) => order.id === current) ? current : data.orders[0]?.id ?? "");
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Tracking data fe'uun hin danda'amne." });
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    void loadCustomerTrackingData(userId)
      .then((data) => {
        if (!active) return;
        setState({ kind: "ready", data });
        setSelectedOrderId(data.orders[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({ kind: "error", message: error instanceof Error ? error.message : "Tracking data fe'uun hin danda'amne." });
      });

    const timer = window.setInterval(() => {
      if (active) void reload(false);
    }, 8000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [reload, userId]);

  if (state.kind === "loading") {
    return <main style={pageStyle}><Header right="Live"/><section style={{ ...cardStyle, marginTop: 34, textAlign: "center", padding: "28px 20px" }}><h1 style={{ margin: 0, fontSize: 21 }}>Tracking fe'aa jira…</h1><p style={{ color: "#68778d", fontSize: 12, lineHeight: 1.6 }}>Customer order, driver assignment fi live GPS secure backend irraa fe'amaa jira.</p></section></main>;
  }
  if (state.kind === "error") return <ErrorState message={state.message} onRetry={() => void reload()} />;
  if (!state.data.orders.length) return <EmptyState onHome={onHome} />;

  const selectedOrder = state.data.orders.find((order) => order.id === selectedOrderId) ?? state.data.orders[0];
  const assignment = state.data.assignments.find((item) => item.order_id === selectedOrder.id);
  const liveTrip = state.data.liveTrips.find((item) => item.order_id === selectedOrder.id);
  const activeCount = state.data.orders.length;
  const selector = state.data.orders.map((order) => ({ id: order.id, label: order.tracking_id || labelStatus(order.status) }));

  return (
    <main style={pageStyle}>
      <Header right={`${activeCount} Active`} />
      {selector.length > 1 && (
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, color: "#68778d", fontSize: 11, fontWeight: 800 }}>Active trip filadhu</span>
          <select value={selectedOrder.id} onChange={(event) => setSelectedOrderId(event.target.value)} style={{ width: "100%", minHeight: 44, border: "1px solid #d8e2ef", borderRadius: 14, background: "#fff", padding: "0 12px", color: "#10213d", fontWeight: 800 }}>
            {selector.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      )}
      <RouteCard order={selectedOrder} />
      <DriverCard assignment={assignment} />
      <LivePositionCard trip={liveTrip} />
      <button type="button" onClick={() => void reload(false)} style={{ marginTop: 14, width: "100%", minHeight: 46, border: "1px solid #d8e2ef", borderRadius: 15, background: "#fff", color: "#10213d", fontWeight: 900 }}>Refresh live tracking</button>
    </main>
  );
}
