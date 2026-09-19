import { useEffect, useState } from "react";
import { loadCustomerMobileData, formatOrderStatus, type CustomerMobileOrder } from "./customer-data.service";
import { customerTruckByKey } from "./customer-vehicle-catalog";
import { useCustomerLanguage, CustomerLanguageSwitcher } from "./customer-language";
import { getCustomerFinalCopy } from "./customer-final-copy";

function ActionIcon({ children }: { children: string }) {
  return <span className="customer-final-action-icon" aria-hidden="true">{children}</span>;
}

function RecentOrder({ order, onOpen }: { order: CustomerMobileOrder; onOpen: () => void }) {
  return (
    <button type="button" className="customer-final-recent-order" onClick={onOpen}>
      <span className="customer-final-order-dot" data-status={order.status || "pending"} />
      <span className="customer-final-recent-copy">
        <strong>{order.tracking_id || order.id}</strong>
        <small>{order.pickup_address || "—"} → {order.dropoff_address || "—"}</small>
        <small>{order.created_at ? new Date(order.created_at).toLocaleDateString() : "—"}</small>
      </span>
      <b className="customer-final-status-pill" data-status={order.status || "pending"}>{formatOrderStatus(order.status)}</b>
    </button>
  );
}

export function CustomerHomePage({
  userId,
  fullName,
  onBook,
  onOrders,
  onTrack,
  onPayments,
  onSaved,
  onSupport,
  onOrder,
}: {
  userId: string;
  fullName: string;
  onBook: () => void;
  onOrders: () => void;
  onTrack: () => void;
  onPayments: () => void;
  onSaved: () => void;
  onSupport: () => void;
  onOrder: (orderId: string) => void;
}) {
  const { language } = useCustomerLanguage();
  const c = getCustomerFinalCopy(language);
  const [orders, setOrders] = useState<CustomerMobileOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const truckImage = customerTruckByKey("dry-cargo").image;

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadCustomerMobileData(userId)
      .then((data) => { if (active) setOrders(data.orders.slice(0, 3)); })
      .catch(() => { if (active) setOrders([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const firstName = fullName.trim().split(/\s+/)[0] || "Customer";

  return (
    <main className="customer-final-page customer-final-home">
      <header className="customer-final-home-header">
        <div>
          <h1>{c.greeting}, {firstName} <span aria-hidden="true">👋</span></h1>
          <p>{c.homeQuestion}</p>
        </div>
        <CustomerLanguageSwitcher compact />
      </header>

      <button className="customer-final-book-hero" type="button" onClick={onBook}>
        <ActionIcon>🚚</ActionIcon>
        <span><strong>{c.bookTruck}</strong><small>{c.instantQuote}</small></span>
        <b aria-hidden="true">→</b>
      </button>

      <section className="customer-final-quick-grid" aria-label={c.homeQuestion}>
        <button type="button" onClick={onTrack}><ActionIcon>⌖</ActionIcon><span>{c.trackOrder}</span></button>
        <button type="button" onClick={onOrders}><ActionIcon>▤</ActionIcon><span>{c.myOrders}</span></button>
        <button type="button" onClick={onPayments}><ActionIcon>▣</ActionIcon><span>{c.payments}</span></button>
        <button type="button" onClick={onSaved}><ActionIcon>●</ActionIcon><span>{c.savedLocations}</span></button>
        <button type="button" onClick={onOrders}><ActionIcon>⌁</ActionIcon><span>{c.myQuotes}</span></button>
        <button type="button" onClick={onSupport}><ActionIcon>?</ActionIcon><span>{c.support}</span></button>
      </section>

      <section className="customer-final-banner">
        <div><strong>Reliable Transport</strong><span>For a Stronger Ethiopia</span></div>
        {truckImage ? <img src={truckImage} alt="" loading="lazy" /> : <span className="customer-final-banner-truck" aria-hidden="true">🚛</span>}
      </section>

      <section className="customer-final-recent">
        <header><h2>{c.recentOrders}</h2><button type="button" onClick={onOrders}>{c.viewAll}</button></header>
        {loading ? (
          <div className="customer-final-state compact" role="status">{c.loading}</div>
        ) : orders.length ? (
          <div className="customer-final-recent-list">{orders.map((order) => <RecentOrder key={order.id} order={order} onOpen={() => onOrder(order.id)} />)}</div>
        ) : (
          <div className="customer-final-state compact"><strong>{c.noRecentOrders}</strong><span>{c.startFirstBooking}</span><button type="button" onClick={onBook}>{c.bookTruck}</button></div>
        )}
      </section>
    </main>
  );
}
