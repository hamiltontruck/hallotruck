# Admin Orders bulk preload hardening

The Admin operations shell no longer loads the complete orders table during normal dashboard or Orders navigation.

- Normal Admin loads keep only the latest 100 order rows as a lightweight dashboard preview.
- Total, active and delivered order KPIs use exact database counts and are not derived from the preview rows.
- Admin Orders itself continues to use the dedicated server-side 50/100 pagination service.
- Specialized control-center queues temporarily retain their full-order fallback so existing queue semantics are preserved until they receive dedicated database-side queries.
- Production pagination/search indexes are tracked by ordered migration `20260911044900_admin_orders_pagination_indexes.sql`.

No production order rows, pricing rules or payment rules are modified by this hardening.
