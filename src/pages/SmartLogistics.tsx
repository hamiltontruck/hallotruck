import { FormEvent, PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../services/supabase.client";
import { AdminLiveTripsPanel } from "../components/admin/AdminLiveTripsPanel";
import { AdminCreateOrderModal } from "../components/admin/AdminCreateOrderModal";
import { AdminMobileBottomNav } from "../components/admin/AdminMobileBottomNav";
import { PaymentCorrectionForm } from "../components/admin/PaymentCorrectionForm";
import { AdminOrder, Customer, DashboardMetrics, DeliveryProof, Driver, Payment, Truck, assignOrder, createCustomer, createOrder, createTruck, getDashboardData, openDeliveryProof, openPaymentReceipt, printInvoice, recordPayment, submitDeliveryProof, subscribeToAdminData, transitionOrder } from "../services/admin.service";

type IconName = "grid" | "box" | "route" | "truck" | "users" | "wallet" | "chart" | "search" | "arrow" | "pin" | "clock" | "menu" | "close";

function Icon({ name, className = "w-5 h-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    box: <><path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5v8l-9 5-9-5V8Z"/><path d="M12 13v8"/></>,
    route: <><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h3a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3h-1"/></>,
    truck: <><path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 1 3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    wallet: <><path d="M4 5h15a2 2 0 0 1 2 2v12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13"/><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 3 3 5-7"/></>,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const requestedQuery = searchParams.get("q") ?? "";
  const initialSection = nav.some(([label]) => label === requestedSection) ? requestedSection as string : "Overview";
  const [section, setSection] = useState(initialSection);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"order" | "customer" | "truck" | null>(null);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [deliveryProofs, setDeliveryProofs] = useState<DeliveryProof[]>([]);
  const [managedOrder, setManagedOrder] = useState<AdminOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState(requestedQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const select = (label: string) => {
    setSection(label);
    setMenuOpen(false);
    const next = new URLSearchParams();
    if (label !== "Overview") next.set("section", label);
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    try {
      const data = await getDashboardData();
      setMetrics(data.metrics); setOrders(data.orders); setCustomers(data.customers); setTrucks(data.trucks); setPayments(data.payments); setDrivers(data.drivers); setDeliveryProofs(data.deliveryProofs); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load dashboard data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const channel = subscribeToAdminData(load);
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  useEffect(() => {
    if (requestedSection && nav.some(([label]) => label === requestedSection)) setSection(requestedSection);
  }, [requestedSection]);

  useEffect(() => { setSearchQuery(requestedQuery); }, [requestedQuery]);

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
          <div className="flex items-center gap-3 px-2 pt-5 pb-1">
            <div className="w-9 h-9 bg-amber text-asphalt font-display font-bold flex items-center justify-center">HT</div>
            <div className="min-w-0"><p className="text-sm font-medium">Hamilton Truck</p><button onClick={() => supabase.auth.signOut()} className="text-[11px] text-white/40 hover:text-amber">Sign out</button></div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="h-20 bg-white border-b border-asphalt/10 px-3 sm:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button className="lg:hidden border border-asphalt/15 p-2" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
            <div className="hidden sm:block min-w-0"><p className="font-display font-semibold text-lg truncate">{section}</p><p className="hidden md:block text-xs text-steel mt-0.5">Live operations</p></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <label className="hidden md:flex items-center gap-2 bg-[#f5f3ed] px-3 py-2.5 w-64 text-steel"><Icon name="search" className="w-4 h-4"/><input aria-label="Search operations" value={searchQuery} onChange={(event)=>{const value=event.target.value;setSearchQuery(value);if(section==="Overview"&&value.trim())select("Orders");}} className="bg-transparent outline-none text-sm w-full" placeholder="Tracking, customer, truck..." /></label>
            <button onClick={() => setModal("order")} className="bg-asphalt text-white font-semibold text-xs sm:text-sm px-3 sm:px-5 py-3 hover:bg-line whitespace-nowrap"><span className="sm:hidden">+ Order</span><span className="hidden sm:inline">+ New order</span></button>
          </div>
        </header>
        <div className="p-5 sm:p-8 max-w-[1500px] mx-auto">
          {error && <p className="bg-route/10 border border-route/30 text-route text-sm p-3 mb-5">{error}</p>}
          {loading ? <div className="py-20 text-center text-steel font-mono text-sm">Loading live operations…</div> : section === "Overview" ? <Overview onOpen={select} metrics={metrics} orders={orders} trucks={trucks} /> : <ModulePage section={section} orders={orders} customers={customers} trucks={trucks} payments={payments} drivers={drivers} searchQuery={searchQuery} initialOrderStatus={searchParams.get("status") ?? "all"} onSearch={setSearchQuery} onManage={setManagedOrder} onAdd={(kind) => setModal(kind)} onReload={load} />}
        </div>
      </main>
      {modal === "order" ? <AdminCreateOrderModal onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load(); }} /> : modal && <CreateModal kind={modal} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load(); }} />}
      {managedOrder && <ManageOrderModal order={managedOrder} trucks={trucks} drivers={drivers} payments={payments} proof={deliveryProofs.find(p=>p.order_id===managedOrder.id)} onClose={() => setManagedOrder(null)} onSaved={async () => { await load(); setManagedOrder(null); }} />}
      <AdminMobileBottomNav />
    </div>
  );
}

function Overview({ onOpen, metrics, orders, trucks }: { onOpen: (name: string) => void; metrics: DashboardMetrics; orders: AdminOrder[]; trucks: Truck[] }) {
  const activeOrders = orders.filter((order) => ["accepted", "in_transit"].includes(order.status));
  const leadActive = activeOrders[0];
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
        <SectionHead title="Active shipments" action="Track all" onClick={() => onOpen("Live trips")} />
        <div className="divide-y divide-asphalt/10">
          {activeOrders.slice(0,3).map((o) => <OrderRow key={o.id} order={o} />)}
          {activeOrders.length === 0 && <Empty label="No active shipments right now." />}
        </div>
      </div>
      <div className="bg-asphalt text-white border border-asphalt">
        <div className="p-5 sm:p-6 flex justify-between"><div><p className="font-display font-semibold text-lg">Live network</p><p className="text-xs text-white/40 mt-1">{activeOrders.length} shipments currently active</p></div><span className={`flex items-center gap-2 text-xs ${leadActive ? "text-amber" : "text-white/40"}`}><i className={`w-2 h-2 rounded-full ${leadActive ? "bg-amber animate-pulse" : "bg-white/20"}`}/>{leadActive ? "LIVE" : "IDLE"}</span></div>
        {leadActive ? <div className="min-h-56 bg-[#252b33] p-6 flex flex-col justify-center"><p className="font-mono text-sm text-amber">{leadActive.tracking_id}</p><p className="font-display text-xl font-semibold mt-3">{leadActive.pickup_address} → {leadActive.dropoff_address}</p><p className="text-xs text-white/50 mt-3">{leadActive.vehicle_type} · <span className="capitalize">{leadActive.status.replace("_", " ")}</span></p><p className="text-xs text-white/40 mt-5">Open Live trips for the latest GPS marker, remaining distance, ETA and trip progress.</p></div> : <div className="min-h-56 bg-[#252b33] p-6 flex flex-col items-center justify-center text-center"><div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-700/20 text-emerald-400">✓</div><p className="font-display text-xl font-semibold mt-4">No active trips</p><p className="text-xs text-white/45 mt-2 max-w-xs">Live GPS tracking will appear after a driver accepts a new load.</p></div>}
        <button onClick={() => onOpen("Live trips")} className="w-full p-4 text-sm text-amber hover:bg-white/5 flex items-center justify-center gap-2">{leadActive ? "Open live tracking" : "View live trips"} <Icon name="arrow" className="w-4 h-4" /></button>
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

function OrderRow({ order:o, onManage }: { order: AdminOrder; onManage?: (order:AdminOrder)=>void }) {
  const color = o.status === "cancelled" ? "bg-red-100 text-red-800" : o.status === "delivered" ? "bg-emerald-100 text-emerald-800" : o.status === "in_transit" ? "bg-amber/20 text-amber-dim" : o.status === "accepted" ? "bg-sky-100 text-sky-800" : "bg-asphalt/5 text-steel";
  return <div className="p-4 sm:px-6 grid grid-cols-[1fr_auto] sm:grid-cols-[100px_1fr_auto_auto_auto] items-center gap-3 sm:gap-5"><span className="font-mono text-xs font-semibold">{o.tracking_id}</span><div className="order-3 sm:order-none col-span-2 sm:col-span-1"><p className="text-sm font-medium flex items-center gap-1.5"><Icon name="pin" className="w-3.5 h-3.5 text-amber" />{o.pickup_address} <span className="text-steel">→</span> {o.dropoff_address}</p><p className="text-[11px] text-steel mt-1">{o.customer_name ?? "Customer"} · {o.cargo_description ?? o.vehicle_type}</p></div><span className="hidden sm:block font-mono text-xs">ETB {Number(o.price_etb ?? 0).toLocaleString()}</span><span className={`text-[10px] font-semibold px-2.5 py-1.5 capitalize ${color}`}>{o.status.replace("_", " ")}</span>{onManage&&<button onClick={()=>onManage(o)} className="text-xs font-semibold text-amber-dim">Manage</button>}</div>;
}

function includesQuery(values: Array<string | number | null | undefined>, query: string) {
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

function ModulePage({ section, orders, customers, trucks, payments, drivers, searchQuery, initialOrderStatus, onSearch, onAdd, onManage, onReload }: { section:string; orders:AdminOrder[]; customers:Customer[]; trucks:Truck[]; payments:Payment[]; drivers:Driver[]; searchQuery:string; initialOrderStatus:string; onSearch:(value:string)=>void; onAdd:(kind:"order"|"customer"|"truck")=>void; onManage:(order:AdminOrder)=>void; onReload:()=>Promise<void> }) {
  const allowedOrderStatuses = ["all", "placed", "accepted", "in_transit", "delivered", "cancelled"];
  const [orderStatus,setOrderStatus]=useState(allowedOrderStatuses.includes(initialOrderStatus) ? initialOrderStatus : "all");
  useEffect(() => {
    setOrderStatus(allowedOrderStatuses.includes(initialOrderStatus) ? initialOrderStatus : "all");
  }, [initialOrderStatus]);
  const descriptions:Record<string,string> = {Orders:"Create, assign and monitor every customer order.","Live trips":"Track active vehicles and delivery progress in real time.","Fleet & drivers":"Manage trucks, drivers, availability and documents.",Customers:"View accounts, order history and customer value.",Finance:"Verify customer payments, link each payment to its order and driver, then release eligible payouts.",Reports:"Measure delivery performance and business growth."};
  const addKind = section === "Customers" ? "customer" : section === "Fleet & drivers" ? "truck" : "order";
  const query=searchQuery.trim().toLowerCase();
  const filteredOrders=orders.filter((order)=>(orderStatus==="all"||order.status===orderStatus)&&includesQuery([order.tracking_id,order.customer_name,order.customer_phone,order.pickup_address,order.dropoff_address,order.vehicle_type,order.cargo_description,order.status],query));
  const filteredCustomers=customers.filter((customer)=>includesQuery([customer.full_name,customer.phone,customer.email,customer.company_name,customer.is_credit_customer?"credit":"standard"],query));
  const filteredTrucks=trucks.filter((truck)=>includesQuery([truck.plate_number,truck.vehicle_type,truck.capacity_tons,truck.status],query));
  const filteredPayments=payments.filter((payment)=>{const order=orders.find((item)=>item.id===payment.order_id);const driver=drivers.find((item)=>item.id===order?.driver_id);return includesQuery([payment.provider,payment.provider_ref,payment.event,payment.amount_etb,order?.tracking_id,order?.customer_name,order?.customer_phone,driver?.full_name,driver?.phone],query);});
  const releasedGross=payments.filter((payment)=>payment.event==="released").reduce((sum,payment)=>sum+Number(payment.amount_etb||0),0);
  const refunded=payments.filter((payment)=>payment.event==="refunded").reduce((sum,payment)=>sum+Number(payment.amount_etb||0),0);
  const releasedNet=Math.max(0,releasedGross-refunded);
  const heldTotal=payments.filter((payment)=>payment.event==="held_escrow").reduce((sum,payment)=>sum+Number(payment.amount_etb||0),0);
  const initiatedTotal=payments.filter((payment)=>payment.event==="initiated").reduce((sum,payment)=>sum+Number(payment.amount_etb||0),0);
  const deliveredCount=orders.filter((order)=>order.status==="delivered").length;
  const activeCount=orders.filter((order)=>["accepted","in_transit"].includes(order.status)).length;
  const completionRate=orders.length?Math.round(deliveredCount/orders.length*100):0;
  const busyFleet=trucks.filter((truck)=>truck.status==="assigned").length;
  const fleetUtilization=trucks.length?Math.round(busyFleet/trucks.length*100):0;
  const approvedDrivers=drivers.filter((driver)=>driver.driver_status==="approved").length;

  return <div>
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5"><div><span className="font-mono text-[10px] tracking-[.2em] text-amber-dim">HALLO SMART LOGISTICS</span><h1 className="font-display font-bold text-3xl mt-2">{section}</h1><p className="text-sm text-steel mt-2">{descriptions[section]}</p></div>{["Orders","Customers","Fleet & drivers"].includes(section) && <button onClick={() => onAdd(addKind)} className="bg-asphalt text-white px-5 py-3 text-sm font-semibold self-start">+ Add new</button>}</div>

    {!["Live trips","Reports"].includes(section)&&<label className="md:hidden mb-5 flex items-center gap-2 border border-asphalt/10 bg-white px-4 py-3 text-steel"><Icon name="search" className="w-4 h-4"/><input aria-label={`Search ${section}`} value={searchQuery} onChange={(event)=>onSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={`Search ${section.toLowerCase()}...`}/>{searchQuery&&<button type="button" onClick={()=>onSearch("")} className="text-xs font-semibold text-route">Clear</button>}</label>}

    {section === "Orders" && <>
      <div className="mb-4 flex flex-wrap gap-2">{["all","placed","accepted","in_transit","delivered","cancelled"].map((status)=><button key={status} onClick={()=>setOrderStatus(status)} className={`border px-3 py-2 text-[11px] font-semibold capitalize ${orderStatus===status?"border-asphalt bg-asphalt text-white":"border-asphalt/10 bg-white text-steel"}`}>{status==="all"?`All ${orders.length}`:`${status.replace("_"," ")} ${orders.filter((order)=>order.status===status).length}`}</button>)}</div>
      <DataPanel title={searchQuery||orderStatus!=="all"?"Matching orders":"All orders"} empty="No matching orders.">{filteredOrders.map(o=><OrderRow key={o.id} order={o} onManage={onManage}/>)}</DataPanel>
    </>}
    {section === "Customers" && <DataPanel title={searchQuery?"Matching customers":"Customers"} empty="No matching customers.">{filteredCustomers.map(c=><SimpleRow key={c.id} title={c.full_name} subtitle={`${c.phone}${c.company_name ? ` · ${c.company_name}` : ""}`} badge={c.is_credit_customer ? "Credit" : "Standard"} />)}</DataPanel>}
    {section === "Fleet & drivers" && <>
      <a href="#/admin/driver-compliance" className="mb-5 flex flex-col gap-3 border border-amber/30 bg-asphalt p-5 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-[10px] tracking-[.16em] text-amber">DRIVER CONTROL & COMPLIANCE</p><p className="mt-2 font-display text-xl font-semibold">Documents, trip history and driver lifecycle</p><p className="mt-1 text-xs text-white/50">{drivers.length} drivers · {approvedDrivers} approved · private verification records stay in the existing Admin control.</p></div><span className="shrink-0 text-sm font-semibold text-amber">Open driver control →</span></a>
      <DataPanel title={searchQuery?"Matching fleet":"Registered fleet"} empty="No matching trucks.">{filteredTrucks.map(t=><SimpleRow key={t.id} title={t.plate_number} subtitle={`${t.vehicle_type} · ${t.capacity_tons ?? "—"} tons`} badge={t.status} />)}</DataPanel>
    </>}
    {section === "Finance" && <>
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4"><FinanceSummaryCard label="Released customer funds" value={releasedNet}/><FinanceSummaryCard label="Held in escrow" value={heldTotal}/><FinanceSummaryCard label="Needs verification" value={initiatedTotal}/><FinanceSummaryCard label="Payment records" value={payments.length} money={false}/></div>
      <DataPanel title={searchQuery?"Matching payments":"Payment ledger"} empty="No matching payments.">{filteredPayments.map(p=><FinancePaymentRow key={p.id} payment={p} order={orders.find(o=>o.id===p.order_id)} driver={drivers.find(d=>d.id===orders.find(o=>o.id===p.order_id)?.driver_id)} allPayments={payments} onManage={onManage} onReload={onReload} />)}</DataPanel>
    </>}
    {section === "Live trips" && <AdminLiveTripsPanel orders={orders} trucks={trucks} drivers={drivers} onManage={onManage} />}
    {section === "Reports" && <>
      <Link to="/admin/intelligence" className="mb-5 flex min-w-0 flex-col gap-4 overflow-hidden bg-asphalt p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="min-w-0"><p className="font-mono text-[10px] tracking-[.18em] text-amber">ADMIN INTELLIGENCE</p><p className="mt-2 break-words font-display text-2xl font-bold">Open next-generation Reports & Global Search</p><p className="mt-2 max-w-2xl break-words text-xs leading-5 text-white/55">Search every operational record, change report periods, inspect revenue trends, top routes and actionable smart signals.</p></div><span className="shrink-0 font-semibold text-amber">Open intelligence →</span></Link>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><ReportCard label="Delivery completion" value={`${completionRate}%`} note={`${deliveredCount} delivered of ${orders.length}`}/><ReportCard label="Active shipments" value={activeCount} note="Accepted + in transit"/><ReportCard label="Fleet utilization" value={`${fleetUtilization}%`} note={`${busyFleet} assigned of ${trucks.length}`}/><ReportCard label="Approved drivers" value={approvedDrivers} note={`${drivers.length} driver profiles`}/><ReportCard label="Released revenue" value={`ETB ${compactMoney(releasedNet)}`} note="Net of recorded credit refunds"/><ReportCard label="Held escrow" value={`ETB ${compactMoney(heldTotal)}`} note="Verified, not released"/><ReportCard label="Pending verification" value={`ETB ${compactMoney(initiatedTotal)}`} note="Initiated customer payments"/><ReportCard label="Customers" value={customers.length} note="Live customer records"/></div>
      <div className="mt-5 border border-asphalt/10 bg-white p-5"><p className="font-display text-lg font-semibold">Operational health</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><HealthRow label="Orders waiting assignment" value={orders.filter((order)=>order.status==="placed").length}/><HealthRow label="Available trucks" value={trucks.filter((truck)=>truck.status==="available").length}/><HealthRow label="Payments needing verification" value={payments.filter((payment)=>payment.event==="initiated").length}/></div></div>
    </>}
  </div>;
}

function DataPanel({ title, empty, children }: { title:string; empty:string; children:React.ReactNode }) { const count = Array.isArray(children) ? children.length : 0; return <div className="bg-white border border-asphalt/10"><div className="p-5 sm:px-6 border-b border-asphalt/10 flex justify-between"><h2 className="font-display font-semibold text-lg">{title}</h2><span className="font-mono text-xs text-steel">{count} {count===1?"record":"records"}</span></div>{count ? children : <Empty label={empty}/>}</div>; }
function SimpleRow({ title, subtitle, badge }: { title:string; subtitle:string; badge:string }) { return <div className="p-4 sm:px-6 border-b border-asphalt/10 last:border-0 flex items-center justify-between gap-4"><div><p className="font-semibold text-sm">{title}</p><p className="text-xs text-steel mt-1">{subtitle}</p></div><span className="text-[10px] font-semibold capitalize bg-amber/15 text-amber-dim px-2.5 py-1.5">{badge.replace("_"," ")}</span></div>; }
function FinanceSummaryCard({label,value,money=true}:{label:string;value:number;money?:boolean}){return <div className="border border-asphalt/10 bg-white p-4 sm:p-5"><p className="font-mono text-[10px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 font-display text-xl font-bold text-asphalt">{money?`ETB ${compactMoney(value)}`:value.toLocaleString()}</p></div>}
function HealthRow({label,value}:{label:string;value:number}){return <div className="bg-[#f5f3ed] p-4"><p className="text-xs text-steel">{label}</p><p className="mt-2 font-display text-2xl font-bold">{value}</p></div>}

function FinancePaymentRow({ payment, order, driver, allPayments, onManage, onReload }: { payment:Payment; order?:AdminOrder; driver?:Driver; allPayments:Payment[]; onManage:(order:AdminOrder)=>void; onReload:()=>Promise<void> }) {
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [correcting,setCorrecting]=useState(false);
  const nextEvent = payment.event === "initiated" ? "held_escrow" : payment.event === "held_escrow" ? "released" : null;
  const invoiceTotal = Number(order?.price_etb ?? 0);
  const orderReleased = order ? allPayments.filter(p=>p.order_id===order.id&&p.event==="released").reduce((sum,p)=>sum+Number(p.amount_etb||0),0) : 0;
  const orderRefunded = order ? allPayments.filter(p=>p.order_id===order.id&&p.event==="refunded").reduce((sum,p)=>sum+Number(p.amount_etb||0),0) : 0;
  const netReleased = Math.max(0, orderReleased-orderRefunded);
  const paymentAmount = Number(payment.amount_etb || 0);
  const releaseExcess = order && payment.event === "held_escrow" ? Math.max(0, netReleased + paymentAmount - invoiceTotal) : 0;
  const canRelease = nextEvent !== "released" || (order?.status === "delivered" && releaseExcess <= 0);
  const canCorrect = payment.event === "held_escrow" || payment.event === "released";
  const deliveryLocked = nextEvent === "released" && order?.status !== "delivered";
  const needsVerification = payment.event === "initiated";
  async function advance(){
    if(!nextEvent) return;
    setSaving(true); setError("");
    const { error:rpcError } = await supabase.rpc("admin_update_payment_event", { p_payment_id:payment.id, p_event:nextEvent });
    if(rpcError){ setError(rpcError.message); setSaving(false); return; }
    await onReload(); setSaving(false);
  }
  async function receipt(){
    if(!payment.receipt_path) return;
    setError("");
    try { await openPaymentReceipt(payment.receipt_path); }
    catch(err){ setError(err instanceof Error ? err.message : "Receipt could not be opened."); }
  }
  return <div className="p-4 sm:px-6 border-b border-asphalt/10 last:border-0">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-base">ETB {paymentAmount.toLocaleString()}</p><span className="text-[10px] font-semibold capitalize bg-amber/15 text-amber-dim px-2.5 py-1.5">{payment.event.replace("_"," ")}</span></div>
        <p className="font-mono text-xs text-asphalt mt-2">{order?.tracking_id ?? "Order not found"}</p>
        <p className="text-xs text-steel mt-1">{order ? `${order.pickup_address} → ${order.dropoff_address}` : "This payment is not linked to a visible order."}</p>
        {order && <p className="text-xs text-steel mt-1">Customer: <span className="font-semibold text-asphalt">{order.customer_name ?? "Customer"}</span>{order.customer_phone ? ` · ${order.customer_phone}` : ""}</p>}
        {order && <p className="text-xs text-steel mt-1">Invoice total: ETB {invoiceTotal.toLocaleString()}</p>}
        <p className="text-xs text-steel mt-1">Driver: {driver?.full_name ?? driver?.phone ?? (order?.driver_id ? "Driver profile unavailable" : "Unassigned")}</p>
        <p className="text-xs text-steel mt-1">{payment.provider}{payment.provider_ref ? ` · Transaction ID: ${payment.provider_ref}` : " · No transaction ID"}</p>
        <p className={`text-xs mt-2 font-semibold ${payment.receipt_path ? "text-emerald-700" : "text-steel"}`}>{payment.receipt_path ? "Customer receipt attached" : "No customer receipt attached"}</p>
        {needsVerification && <p className="text-xs text-amber-dim font-semibold mt-2">Verification required — confirm this payment before holding it in escrow.</p>}
        {releaseExcess > 0 && <p className="text-xs text-route font-semibold mt-2">Release exceeds invoice balance by ETB {releaseExcess.toLocaleString()}.</p>}
        {deliveryLocked && <p className="text-xs text-route mt-2">Release is locked until this order is delivered.</p>}
        {error && !deliveryLocked && <p className="text-xs text-route mt-2">{error}</p>}
      </div>
      <div className="flex sm:flex-col gap-2 shrink-0 flex-wrap">
        {order && <button onClick={()=>onManage(order)} className="border border-asphalt/20 px-3 py-2 text-xs font-semibold">Open order</button>}
        {payment.receipt_path && <button onClick={receipt} className="border border-emerald-700 text-emerald-800 px-3 py-2 text-xs font-semibold">Open receipt</button>}
        {nextEvent && <button disabled={saving||!canRelease} onClick={advance} className="bg-asphalt text-white px-3 py-2 text-xs font-semibold disabled:opacity-35">{saving?"Saving…":nextEvent==="held_escrow"?"Verify payment":"Release payment"}</button>}
        {canCorrect && <button disabled={saving} onClick={()=>setCorrecting(value=>!value)} className="bg-route px-3 py-2 text-xs font-semibold text-white disabled:opacity-35">{correcting?"Cancel correction":"Correct / refund"}</button>}
      </div>
    </div>
    {correcting&&<PaymentCorrectionForm paymentId={payment.id} paymentAmountEtb={paymentAmount} onCancel={()=>setCorrecting(false)} onSubmitted={onReload}/>}
  </div>;
}

function ReportCard({ label, value, note="Live from Supabase" }: { label:string; value:string|number; note?:string }) { return <div className="bg-white border border-asphalt/10 p-5 sm:p-7"><p className="text-xs text-steel">{label}</p><p className="font-display font-bold text-2xl sm:text-3xl mt-4 break-words">{value}</p><p className="text-[11px] text-emerald-700 mt-4">{note}</p></div>; }
function Empty({ label }: { label:string }) { return <p className="p-8 text-center text-sm text-steel">{label}</p>; }
function compactMoney(value:number) { return value >= 1_000_000 ? `${(value/1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value/1_000).toFixed(1)}K` : value.toLocaleString(); }

function ManageOrderModal({ order, trucks, drivers, payments, proof, onClose, onSaved }: { order:AdminOrder; trucks:Truck[]; drivers:Driver[]; payments:Payment[]; proof?:DeliveryProof; onClose:()=>void; onSaved:()=>void }) {
  const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const availableTrucks=trucks.filter(t=>t.status==="available"||t.id===order.truck_id);
  const orderPayments=payments.filter(p=>p.order_id===order.id);
  async function run(action:()=>Promise<void>){setSaving(true);setError("");try{await action();await onSaved();}catch(err){setError(err instanceof Error?err.message:"Update failed.");setSaving(false);}}
  async function assign(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);await run(()=>assignOrder(order.id,String(form.get("truckId")),String(form.get("driverId"))));}
  async function pay(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);await run(()=>recordPayment({orderId:order.id,provider:String(form.get("provider")),providerRef:String(form.get("providerRef")||""),amountEtb:Number(form.get("amountEtb")),event:String(form.get("event")) as "initiated"|"held_escrow"|"released"}));}
  const truck=trucks.find(t=>t.id===order.truck_id); const driver=drivers.find(d=>d.id===order.driver_id);
  return <div className="fixed inset-0 z-50 bg-asphalt/70 p-3 grid place-items-center"><div className="bg-white w-full max-w-2xl max-h-[94vh] overflow-y-auto p-5 sm:p-8"><div className="flex justify-between gap-3"><div><p className="font-mono text-xs text-amber-dim">{order.tracking_id}</p><h2 className="font-display font-bold text-2xl mt-1">Manage order</h2></div><button onClick={onClose}><Icon name="close"/></button></div>{error&&<p className="mt-4 text-route text-sm bg-route/10 p-3">{error}</p>}
    <div className="mt-6 border border-asphalt/10 p-4"><p className="text-xs text-steel">Current workflow</p><div className="flex flex-wrap gap-2 mt-3">{["placed","accepted","in_transit","delivered","cancelled"].map(s=><span key={s} className={`px-3 py-2 text-xs capitalize ${order.status===s?(s==="cancelled"?"bg-red-100 text-red-800 font-semibold":"bg-amber text-asphalt font-semibold"):"bg-[#f5f3ed] text-steel"}`}>{s.replace("_"," ")}</span>)}</div>{order.status==="accepted"&&<button disabled={saving} onClick={()=>run(()=>transitionOrder(order.id,"in_transit"))} className="bg-asphalt text-white px-4 py-3 text-sm font-semibold mt-4">Start transit</button>}{order.status==="cancelled"&&<div className="mt-4 border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">Cancelled by {order.cancellation_source ?? "customer"}</p><p className="mt-2 whitespace-pre-wrap">{order.cancellation_reason ?? "No cancellation reason recorded."}</p>{order.cancelled_at&&<p className="mt-2 text-xs text-red-700">{new Date(order.cancelled_at).toLocaleString()}</p>}<p className="mt-3 text-xs text-steel">Payments are not refunded automatically. Review them in Finance.</p></div>}</div>
    {order.status==="in_transit"&&<ProofOfDeliveryForm orderId={order.id} saving={saving} onSubmit={(input)=>run(()=>submitDeliveryProof(input))}/>}
    {proof&&<div className="mt-5 border border-emerald-700/30 bg-emerald-50 p-4"><h3 className="font-semibold text-emerald-800">Proof of delivery recorded</h3><p className="text-sm mt-2">Received by {proof.recipient_name} · {new Date(proof.delivered_at).toLocaleString()}</p>{proof.delivery_note&&<p className="text-xs text-steel mt-2">{proof.delivery_note}</p>}<div className="flex gap-4 mt-3"><button onClick={()=>openDeliveryProof(proof.photo_path)} className="text-xs font-semibold text-amber-dim">View photo</button><button onClick={()=>openDeliveryProof(proof.signature_path)} className="text-xs font-semibold text-amber-dim">View signature</button></div></div>}
    {order.status!=="cancelled"&&order.status!=="delivered"&&<form onSubmit={assign} className="mt-5 border border-asphalt/10 p-4"><h3 className="font-semibold">Assign truck & driver</h3><div className="grid sm:grid-cols-2 gap-3 mt-4"><Select name="truckId" label="Truck" defaultValue={order.truck_id??""} options={availableTrucks.map(t=>[t.id,`${t.plate_number} · ${t.status}`])}/><Select name="driverId" label="Driver" defaultValue={order.driver_id??""} options={drivers.map(d=>[d.id,d.full_name||d.phone||"Driver"])} /></div>{drivers.length===0&&<p className="text-xs text-route mt-3">No driver profiles found. Create an Auth user with profile role “driver” first.</p>}<button disabled={saving||!availableTrucks.length||!drivers.length} className="bg-asphalt text-white px-4 py-3 text-sm font-semibold mt-4 disabled:opacity-40">Assign & accept</button></form>}
    <form onSubmit={pay} className="mt-5 border border-asphalt/10 p-4"><h3 className="font-semibold">Payment & verification</h3><div className="grid sm:grid-cols-2 gap-3 mt-4"><Field name="provider" label="Provider"/><Field name="providerRef" label="Transaction ID / Reference" required={false}/><Field name="amountEtb" label="Amount ETB" type="number"/><Select name="event" label="Payment event" defaultValue="initiated" options={[["initiated","Initiated / needs verification"],["held_escrow","Verified / held in escrow"],["released","Released after delivery"]]}/></div><p className="text-[11px] text-steel mt-3">A provider + Transaction ID can only be recorded once. Refunds and invalidations use the audited correction action in Finance.</p><button disabled={saving} className="bg-asphalt text-white px-4 py-3 text-sm font-semibold mt-4">Save payment event</button></form>
    <div className="mt-5 border border-asphalt/10"><div className="p-4 border-b border-asphalt/10"><h3 className="font-semibold">Payment evidence</h3><p className="text-xs text-steel mt-1">Invoice total: ETB {Number(order.price_etb ?? 0).toLocaleString()}</p></div>{orderPayments.length?orderPayments.map(payment=><div key={payment.id} className="p-4 border-b border-asphalt/10 last:border-0 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">ETB {Number(payment.amount_etb).toLocaleString()} · <span className="capitalize">{payment.event.replace("_"," ")}</span></p><p className="text-xs text-steel mt-1">{payment.provider}{payment.provider_ref?` · ${payment.provider_ref}`:""}</p><p className={`text-xs mt-1 ${payment.receipt_path?"text-emerald-700":"text-steel"}`}>{payment.receipt_path?"Customer receipt attached":"No customer receipt attached"}</p></div>{payment.receipt_path&&<button type="button" onClick={()=>openPaymentReceipt(payment.receipt_path!)} className="border border-emerald-700 text-emerald-800 px-3 py-2 text-xs font-semibold">Open receipt</button>}</div>):<p className="p-4 text-xs text-steel">No payment records yet.</p>}</div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-steel">{orderPayments.length} {orderPayments.length===1?"payment record":"payment records"} · {order.payment_status.replace("_"," ")}</p><button onClick={()=>printInvoice(order,truck,driver,orderPayments)} className="border border-asphalt px-4 py-3 text-sm font-semibold">Invoice / receipt PDF</button></div>
  </div></div>;
}

function Select({name,label,options,defaultValue}:{name:string;label:string;options:string[][];defaultValue:string}){return <label className="text-xs font-semibold">{label}<select name={name} required defaultValue={defaultValue} className="block w-full border border-asphalt/20 px-3 py-3 mt-2 bg-white text-sm"><option value="" disabled>Select {label.toLowerCase()}</option>{options.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>}

function ProofOfDeliveryForm({orderId,saving,onSubmit}:{orderId:string;saving:boolean;onSubmit:(input:{orderId:string;recipientName:string;deliveryNote:string;photo:File;signature:Blob})=>void}){
  const canvas=useRef<HTMLCanvasElement>(null); const drawing=useRef(false); const [signed,setSigned]=useState(false); const [error,setError]=useState("");
  function point(event:PointerEvent<HTMLCanvasElement>){const target=canvas.current!;const rect=target.getBoundingClientRect();return {x:(event.clientX-rect.left)*(target.width/rect.width),y:(event.clientY-rect.top)*(target.height/rect.height)}}
  function start(event:PointerEvent<HTMLCanvasElement>){event.currentTarget.setPointerCapture(event.pointerId);drawing.current=true;const context=canvas.current?.getContext("2d");const p=point(event);context?.beginPath();context?.moveTo(p.x,p.y);setSigned(true)}
  function move(event:PointerEvent<HTMLCanvasElement>){if(!drawing.current)return;const context=canvas.current?.getContext("2d");const p=point(event);if(context){context.lineWidth=3;context.lineCap="round";context.strokeStyle="#1d222a";context.lineTo(p.x,p.y);context.stroke()}}
  function stop(){drawing.current=false}
  function clear(){const target=canvas.current;target?.getContext("2d")?.clearRect(0,0,target.width,target.height);setSigned(false)}
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setError("");const form=new FormData(event.currentTarget);const photo=form.get("photo");if(!(photo instanceof File)||!photo.size){setError("Delivery photo is required.");return}if(!signed||!canvas.current){setError("Recipient signature is required.");return}canvas.current.toBlob(blob=>{if(!blob){setError("Could not save signature.");return}onSubmit({orderId,recipientName:String(form.get("recipientName")),deliveryNote:String(form.get("deliveryNote")||""),photo,signature:blob})},"image/png")}
  return <form onSubmit={submit} className="mt-5 border-2 border-emerald-700/30 p-4"><h3 className="font-semibold text-emerald-800">Proof of delivery</h3><p className="text-xs text-steel mt-1">Photo and signature are required before delivery is completed.</p>{error&&<p className="text-xs text-route bg-route/10 p-2 mt-3">{error}</p>}<div className="grid sm:grid-cols-2 gap-3 mt-4"><Field name="recipientName" label="Received by"/><label className="text-xs font-semibold">Delivery photo<input name="photo" type="file" accept="image/*" capture="environment" required className="block w-full border border-asphalt/20 px-3 py-3 mt-2 text-sm"/></label></div><label className="block text-xs font-semibold mt-3">Delivery note<textarea name="deliveryNote" rows={3} className="block w-full border border-asphalt/20 px-3 py-3 mt-2 text-sm" placeholder="Package condition, recipient comment…"/></label><div className="mt-3"><div className="flex justify-between"><span className="text-xs font-semibold">Recipient signature</span><button type="button" onClick={clear} className="text-xs text-route">Clear</button></div><canvas ref={canvas} width={600} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} className="w-full h-36 border border-asphalt/20 bg-white mt-2 touch-none"/></div><button disabled={saving} className="w-full bg-emerald-700 text-white py-4 mt-4 font-semibold disabled:opacity-40">{saving?"Uploading proof…":"Submit proof & mark delivered"}</button></form>
}

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
function Field({name,label,type="text",required=true,defaultValue,min,step}:{name:string;label:string;type?:string;required?:boolean;defaultValue?:string;min?:number;step?:string}) { return <label className="text-xs font-semibold">{label}<input name={name} type={type} required={required} defaultValue={defaultValue} min={type==="number"?(min??0):undefined} step={step} className="block w-full border border-asphalt/20 px-3 py-3 mt-2 outline-none focus:border-amber font-normal text-sm"/></label>; }
