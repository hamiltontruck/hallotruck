# Admin dashboard reference data hardening

This slice removes legacy route-dependent load-all fallbacks from `getDashboardData()` and keeps every dashboard preview bounded to 100 rows.

Exact dashboard counts remain database-side and are independent from preview size for total orders, active orders, delivered orders, available trucks, and customers.

This change does not update, delete, backfill, or rewrite production business data. Dedicated server-side pagination/search for full Customers and Fleet/Driver workspaces is the next slice.
