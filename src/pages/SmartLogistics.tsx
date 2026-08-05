import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase.client";
import { AdminOrder, Customer, DashboardMetrics, Payment, Truck, createCustomer, createOrder, createTruck, getDashboardData, subscribeToAdminData } from "../services/admin.service";

type IconName = "grid" | "box" | "route" | "truck" | "users" | "wallet" | "chart" | "bell" | "search" | "arrow" | "pin" | "clock" | "menu" | "close";

function Icon({ name, className = "w-5 h-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    box: <><path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5v8l-9 5-9-5V8Z"/><path d="M12 13v8"/></>,
    route: <><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h3a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3h-1"/></>,
    truck: <><path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    wallet: <><path d="M4 5h15a2 2 0 0 1 2 2v12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13"/><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 3 3 5-7"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

const nav = [
  ["Overview", "grid"], ["Orders", "box"], ["Live trips", "route"], ["Fleet & drivers", "truck"],
  ["Customers", "users"], ["Finance", "wallet"], ["Reports", "chart"],
] as const;

const emptyMetrics: DashboardMetrics = { totalOrders: 0, activeOrders: 0, deliveredOrders: 0, availableTrucks: 0, totalCustomers: 0, revenueEtb: 0 };

export function SmartLogistics() {
  const [section, setSection] = useState("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"order" | "customer" | "truck" | null>(null);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const select = (label: string) => { setSection(label); setMenuOpen(false); };

  const load = useCallback(async () => {
    try {
      const data = await getDashboardData();
      setMetrics(data.metrics); setOrders(data.orders); setCustomers(data.customers); setTrucks(data.trucks); setPayments(data.payments); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load dashboard data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const channel = subscribeToAdminData(load);
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return (
    <div className="min-h-screen bg-[#f5f3ed] text-asphalt font-body lg:flex">
      {menuOpen && <button aria-label="Close menu" className="fixed inset-0 bg-asphalt/40 z-30 lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-[280px] bg-asphalt text-white flex flex-col transition-transform duration-300 ${menuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="px-7 h-24 flex items-center justify-between border-b border-white/10">
          <button onClick={() => select("Overview")} className="text-left">
            <div className="font-display font-bold text-xl tracking-tight">HALLO<span className="text-amber">TRUCK</span></div>
            <div className="font-mono text-[9px] tracking-[.28em] text-white/45 mt-1">SMART LOGISTICS</div>
          </button>
          <button className="lg:hidden text-white/60" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>
        </div>
        <nav className="px-4 py-7 space-y-1 flex-1">
          <p className="font-mono text-[10px] tracking-[.2em] text-white/35 px-3 mb-4">WORKSPACE</p>
          {nav.map(([label, icon]) => (
            <button key={label} onClick={() => select(label)} className={`w-full flex items-center gap-3 px-3 py-3 text-sm transition ${section === label ? "bg-amber text-asphalt font-semibold" : "text-white/60 hover:text-white hover:bg-white/5"}`}>
              <Icon name={icon} className="w-[18px] h-[18px]" />{label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <Link to="/driver" className="flex items-center justify-between bg-white/5 hover:bg-white/10 p-4 group">
            <div><p className="text-sm font-semibold">Driver portal</p><p className="text-xs text-white/40 mt-1">Open mobile workspace</p></div>
            <Icon name="arrow" className="w-4 h-4 text-amber group-hover:translate-x-1 transition" />
          </Link>
          <div className="flex items-center gap-3 px-2 pt-5 pb-1">
            <div className="w-9 h-9 bg-amber text-asphalt font-display font-bold flex items-center justify-center">HT</div>
          <div className="min-w-0"><p className="text-sm font-medium">Hamilton Truck</p><button onClick={() => supabase.auth.signOut()} className="text-[11px] text-white/40 hover:text-amber">Sign out</button></div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="h-20 bg-white border-b border-asphalt/10 px-5 sm:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button className="lg:hidden border border-asphalt/15 p-2" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
            <div><p className="font-display font-semibold text-lg">{section}</p><p className="hidden sm:block text-xs text-steel mt-0.5">Tuesday, 4 August 2026</p></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <label className="hidden md:flex items-center gap-2 bg-[#f5f3ed] px-3 py-2.5 w-60 text-steel"><Icon name="search" className="w-4 h-4"/><input aria-label="Search" className="bg-transparent outline-none text-sm w-full" placeholder="Search orders, drivers..." /></label>
            <button className="relative border border-asphalt/10 p-2.5 text-steel"><Icon name="bell" className="w-5 h-5"/><span className="absolute top-2 right-2 w-2 h-2 bg-route rounded-full border border-white" /></button>
            <button onClick={() => setModal("order")} className="bg-asphalt text-white font-semibold text-sm px-4 sm:px-5 py-3 hover:bg-line">+ New order</button>
          </div>
        </header>

        <div className="p-5 sm:p-8 max-w-[1500px] mx-auto">
          {error && <p className="bg-route/10 border border-route/30 text-route text-sm p-3 mb-5">{error}</p>}
          {loading ? <div className="py-20 text-center text-steel font-mono text-sm">Loading live operations…</div> : section === "Overview" ? <Overview onOpen={select} metrics={metrics} orders={orders} trucks={trucks} /> : <ModulePage section={section} orders={orders} customers={customers} trucks={trucks} payments={payments} onAdd={(kind) => setModal(kind)} />}
        </div>
      </main>
      {modal && <CreateModal kind={modal} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load(); }} />}
    </div>
  );
}

function Overview({ onOpen, metrics, orders, trucks }: { onOpen: (name: string) => void; metrics: DashboardMetrics; orders: AdminOrder[]; trucks: Truck[] }) {
  return <>
    <section className="bg-asphalt text-white relative overflow-hidden p-6 sm:p-9 mb-7">
      <div className="absolute -right-12 -top-24 w-72 h-72 border-[48px] border-amber/10 rounded-full" />
      <div className="relative max-w-2xl"><span className="font-mono text-[10px] tracking-[.2em] text-amber">OPERATIONS CONTROL</span><h1 className="font-display font-bold text-3xl sm:text-4xl mt-3">Move smarter. Deliver better.</h1><p className="text-white/55 mt-3 text-sm sm:text-base leading-relaxed">Your logistics network at a glance — orders, live vehicles, delivery performance and revenue in one place.</p></div>
    </section>
    <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5 mb-7">
      <Kpi label="Total orders" value={String(metrics.totalOrders)} delta={`${metrics.activeOrders} active`} icon="box" />
      <Kpi label="Available trucks" value={String(metrics.availableTrucks)} delta={`${trucks.length} fleet`} icon="truck" />
      <Kpi label="Delivered orders" value={String(metrics.deliveredOrders)} delta="Live" icon="clock" />
      <Kpi label="Released revenue" value={`ETB ${compactMoney(metrics.revenueEtb)}`} delta="Live" icon="wallet" />
    </section>
    <section className="grid xl:grid-cols-[1.55fr_1fr] gap-5 mb-7">
      <div className="bg-white border border-asphalt/10">
        <SectionHead title="Active shipments" action="View all" onClick={() => onOpen("Orders")} />
        <div className="divide-y divide-asphalt/10">
          {orders.slice(0,3).map((o) => <OrderRow key={o.id} order={o} />)}
          {orders.length === 0 && <Empty label="No orders yet. Use + New order to create the first one." />}
        </div>
      </div>
      <div className="bg-asphalt text-white border border-asphalt">
        <div className="p-5 sm:p-6 flex justify-between"><div><p className="font-display font-semibold text-lg">Live network</p><p className="text-xs text-white/40 mt-1">{metrics.activeOrders} shipments currently active</p></div><span className="flex items-center gap-2 text-xs text-amber"><i className="w-2 h-2 bg-amber rounded-full animate-pulse"/>LIVE</span></div>
        <div className="relative h-56 bg-[#252b33] overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{backgroundImage:"linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",backgroundSize:"42px 42px"}} />
          <svg viewBox="0 0 500 220" className="absolute inset-0 w-full h-full"><path d="M-20 180 C80 130 110 190 190 110 S330 55 520 80" fill="none" stroke="#e8a33d" strokeWidth="3" strokeDasharray="8 8"/><path d="M30 30 C110 90 210 30 280 120 S420 190 520 150" fill="none" stroke="#fff" strokeOpacity=".12" strokeWidth="2"/></svg>
          {[["21%","62%"],["50%","43%"],["72%","25%"],["82%","60%"]].map((p,i)=><span key={i} className="absolute w-4 h-4 bg-amber border-[3px] border-asphalt rounded-full shadow-[0_0_0_5px_rgba(232,163,61,.18)]" style={{left:p[0],top:p[1]}} />)}
          <div className="absolute bottom-4 left-4 bg-white text-asphalt px-3 py-2 text-xs"><b>{orders[0]?.tracking_id ?? "NO ACTIVE TRIPS"}</b><span className="text-steel ml-2">{orders[0]?.dropoff_address ?? "Waiting for orders"}</span></div>
        </div>
        <button onClick={() => onOpen("Live trips")} className="w-full p-4 text-sm text-amber hover:bg-white/5 flex items-center justify-center gap-2">Open live tracking <Icon name="arrow" className="w-4 h-4" /></button>
      </div>
    </section>
    <section className="grid xl:grid-cols-[1.55fr_1fr] gap-5">
      <div className="bg-white border border-asphalt/10"><SectionHead title="Fleet activity" action="Manage fleet" onClick={() => onOpen("Fleet & drivers")} /><div className="divide-y divide-asphalt/10">{trucks.slice(0,4).map((truck)=><div key={truck.id} className="p-4 sm:px-6 flex items-center gap-4"><div className="w-10 h-10 bg-[#f5f3ed] flex items-center justify-center text-amber"><Icon name="truck" /></div><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="font-mono text-xs font-semibold">{truck.plate_number}</p><span className="text-[11px] text-steel capitalize">{truck.status}</span></div><p className="text-xs text-steel mt-1 truncate">{truck.vehicle_type} · {truck.capacity_tons ?? "—"} tons</p></div></div>)}{trucks.length === 0 && <Empty label="No trucks registered yet." />}</div></div>
      <div className="bg-amber p-6 sm:p-7 flex flex-col justify-between min-h-64"><div><span className="font-mono text-[10px] tracking-[.18em]">LIVE REVENUE</span><p className="font-display font-bold text-4xl mt-5">ETB {compactMoney(metrics.revenueEtb)}</p><p className="text-sm mt-2 opacity-70">Released customer payments</p></div><div><div className="h-2 bg-asphalt/20 mb-4"><div className="h-full bg-asphalt" style={{width: `${Math.min(100, metrics.revenueEtb / 50000)}%`}} /></div><p className="text-xs leading-relaxed opacity-70">Updated automatically when payment events change in Supabase.</p></div></div>
    </section>
  </>;
}

function Kpi({ label, value, delta, icon }: { label:string; value:string; delta:string; icon:IconName }) {
  return <div className="bg-white border border-asphalt/10 p-4 sm:p-5"><div className="flex justify-between items-start"><span className="w-9 h-9 bg-[#f5f3ed] text-steel flex items-center justify-center"><Icon name={icon} className="w-[18px] h-[18px]" /></span><span className="font-mono text-[10px] text-emerald-700">{delta}</span></div><p className="font-display font-bold text-xl sm:text-2xl mt-5 break-words">{value}</p><p className="text-xs text-steel mt-1">{label}</p></div>;
}

function SectionHead({ title, action, onClick }: { title:string; action:string; onClick:()=>void }) {
  return <div className="p-5 sm:px-6 border-b border-asphalt/10 flex items-center justify-between"><h2 className="font-display font-semibold text-lg">{title}</h2><button onClick={onClick} className="text-xs font-semibold text-amber-dim flex items-center gap-1">{action}<Icon name="arrow" className="w-3.5 h-3.5"/></button></div>;
}

function OrderRow({ order:o }: { order: AdminOrder }) {
  const color = o.status === "delivered" ? "bg-emerald-100 text-emerald-800" : o.status === "in_transit" ? "bg-amber/20 text-amber-dim" : o.status === "accepted" ? "bg-sky-100 text-sky-800" : "bg-asphalt/5 text-steel";
  return <div className="p-4 sm:px-6 grid grid-cols-[1fr_auto] sm:grid-cols-[100px_1fr_auto_auto] items-center gap-3 sm:gap-5"><span className="font-mono text-xs font-semibold">{o.tracking_id}</span><div className="order-3 sm:order-none col-span-2 sm:col-span-1"><p className="text-sm font-medium flex items-center gap-1.5"><Icon name="pin" className="w-3.5 h-3.5 text-amber" />{o.pickup_address} <span className="text-steel">→</span> {o.dropoff_address}</p><p className="text-[11px] text-steel mt-1">{o.customer_name ?? "Customer"} · {o.cargo_description ?? o.vehicle_type}</p></div><span className="hidden sm:block font-mono text-xs">ETB {Number(o.price_etb ?? 0).toLocaleString()}</span><span className={`text-[10px] font-semibold px-2.5 py-1.5 capitalize ${color}`}>{o.status.replace("_", " ")}</span></div>;
}

function ModulePage({ section, orders, customers, trucks, payments, onAdd }: { section:string; orders:AdminOrder[]; customers:Customer[]; trucks:Truck[]; payments:Payment[]; onAdd:(kind:"order"|"customer"|"truck")=>void }) {
  const descriptions:Record<string,string> = {Orders:"Create, assign and monitor every customer order.","Live trips":"Track active vehicles and delivery progress in real time.","Fleet & drivers":"Manage trucks, drivers, availability and documents.",Customers:"View accounts, order history and customer value.",Finance:"Monitor revenue, payouts, invoices and payment status.",Reports:"Measure delivery performance and business growth."};
  const addKind = section === "Customers" ? "customer" : section === "Fleet & drivers" ? "truck" : "order";
  return <div>
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7"><div><span className="font-mono text-[10px] tracking-[.2em] text-amber-dim">HALLO SMART LOGISTICS</span><h1 className="font-display font-bold text-3xl mt-2">{section}</h1><p className="text-sm text-steel mt-2">{descriptions[section]}</p></div>{["Orders","Customers","Fleet & drivers"].includes(section) && <button onClick={() => onAdd(addKind)} className="bg-asphalt text-white px-5 py-3 text-sm font-semibold self-start">+ Add new</button>}</div>
    {section === "Orders" && <DataPanel title="All orders" empty="No orders yet.">{orders.map(o=><OrderRow key={o.id} order={o}/>)}</DataPanel>}
    {section === "Customers" && <DataPanel title="Customers" empty="No customers yet.">{customers.map(c=><SimpleRow key={c.id} title={c.full_name} subtitle={`${c.phone}${c.company_name ? ` · ${c.company_name}` : ""}`} badge={c.is_credit_customer ? "Credit" : "Standard"} />)}</DataPanel>}
    {section === "Fleet & drivers" && <DataPanel title="Registered fleet" empty="No trucks yet.">{trucks.map(t=><SimpleRow key={t.id} title={t.plate_number} subtitle={`${t.vehicle_type} · ${t.capacity_tons ?? "—"} tons`} badge={t.status} />)}</DataPanel>}
    {section === "Finance" && <DataPanel title="Payment ledger" empty="No payments yet.">{payments.map(p=><SimpleRow key={p.id} title={`ETB ${Number(p.amount_etb).toLocaleString()}`} subtitle={`${p.provider}${p.provider_ref ? ` · ${p.provider_ref}` : ""}`} badge={p.event} />)}</DataPanel>}
    {section === "Live trips" && <DataPanel title="Active trips" empty="No active trips right now.">{orders.filter(o=>["accepted","in_transit"].includes(o.status)).map(o=><OrderRow key={o.id} order={o}/>)}</DataPanel>}
    {section === "Reports" && <div className="grid sm:grid-cols-3 gap-5"><ReportCard label="Orders" value={orders.length}/><ReportCard label="Customers" value={customers.length}/><ReportCard label="Fleet" value={trucks.length}/></div>}
  </div>;
}

function DataPanel({ title, empty, children }: { title:string; empty:string; children:React.ReactNode }) { const count = Array.isArray(children) ? children.length : 0; return <div className="bg-white border border-asphalt/10"><div className="p-5 sm:px-6 border-b border-asphalt/10 flex justify-between"><h2 className="font-display font-semibold text-lg">{title}</h2><span className="font-mono text-xs text-steel">{count} records</span></div>{count ? children : <Empty label={empty}/>}</div>; }
function SimpleRow({ title, subtitle, badge }: { title:string; subtitle:string; badge:string }) { return <div className="p-4 sm:px-6 border-b border-asphalt/10 last:border-0 flex items-center justify-between gap-4"><div><p className="font-semibold text-sm">{title}</p><p className="text-xs text-steel mt-1">{subtitle}</p></div><span className="text-[10px] font-semibold capitalize bg-amber/15 text-amber-dim px-2.5 py-1.5">{badge.replace("_"," ")}</span></div>; }
function ReportCard({ label, value }: { label:string; value:number }) { return <div className="bg-white border border-asphalt/10 p-7"><p className="text-xs text-steel">{label}</p><p className="font-display font-bold text-4xl mt-4">{value}</p><p className="text-[11px] text-emerald-700 mt-4">Live from Supabase</p></div>; }
function Empty({ label }: { label:string }) { return <p className="p-8 text-center text-sm text-steel">{label}</p>; }
function compactMoney(value:number) { return value >= 1_000_000 ? `${(value/1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value/1_000).toFixed(1)}K` : value.toLocaleString(); }

function CreateModal({ kind, onClose, onSaved }: { kind:"order"|"customer"|"truck"; onClose:()=>void; onSaved:()=>void }) {
  const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); const form=new FormData(event.currentTarget); try {
    if(kind==="order") await createOrder({customerName:String(form.get("customerName")),customerPhone:String(form.get("customerPhone")),pickupAddress:String(form.get("pickupAddress")),dropoffAddress:String(form.get("dropoffAddress")),cargoDescription:String(form.get("cargoDescription")||""),vehicleType:String(form.get("vehicleType")),priceEtb:Number(form.get("priceEtb"))});
    if(kind==="customer") await createCustomer({fullName:String(form.get("fullName")),phone:String(form.get("phone")),email:String(form.get("email")||""),companyName:String(form.get("companyName")||"")});
    if(kind==="truck") await createTruck({plateNumber:String(form.get("plateNumber")),vehicleType:String(form.get("vehicleType")),capacityTons:Number(form.get("capacityTons")||0)});
    onSaved();
  } catch(err){setError(err instanceof Error?err.message:"Save failed."); setSaving(false);} }
  return <div className="fixed inset-0 z-50 bg-asphalt/70 p-4 grid place-items-center"><form onSubmit={submit} className="bg-white w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 sm:p-8"><div className="flex justify-between items-center"><h2 className="font-display font-bold text-2xl capitalize">New {kind}</h2><button type="button" onClick={onClose}><Icon name="close"/></button></div>{error&&<p className="mt-4 text-route text-sm bg-route/10 p-3">{error}</p>}<div className="grid sm:grid-cols-2 gap-4 mt-6">
    {kind==="order"&&<><Field name="customerName" label="Customer name"/><Field name="customerPhone" label="Phone"/><Field name="pickupAddress" label="Pickup address"/><Field name="dropoffAddress" label="Delivery address"/><Field name="cargoDescription" label="Cargo description"/><Field name="vehicleType" label="Vehicle type"/><Field name="priceEtb" label="Price ETB" type="number"/></>}
    {kind==="customer"&&<><Field name="fullName" label="Full name"/><Field name="phone" label="Phone"/><Field name="email" label="Email" type="email" required={false}/><Field name="companyName" label="Company" required={false}/></>}
    {kind==="truck"&&<><Field name="plateNumber" label="Plate number"/><Field name="vehicleType" label="Vehicle type"/><Field name="capacityTons" label="Capacity (tons)" type="number" required={false}/></>}
  </div><button disabled={saving} className="w-full bg-asphalt text-white py-4 mt-6 font-semibold disabled:opacity-50">{saving?"Saving…":"Save to Supabase"}</button></form></div>;
}
function Field({name,label,type="text",required=true}:{name:string;label:string;type?:string;required?:boolean}) { return <label className="text-xs font-semibold">{label}<input name={name} type={type} required={required} min={type==="number"?0:undefined} className="block w-full border border-asphalt/20 px-3 py-3 mt-2 outline-none focus:border-amber font-normal text-sm"/></label>; }
