# Admin Orders pagination

The Admin Orders workspace uses Supabase server-side pagination with 50/100 row page sizes.

- Order rows are filtered in the database before `.range(from, to)` is applied.
- Search covers tracking ID, customer name/phone, route, vehicle type and cargo description.
- Status counts use exact database counts and include `quoted`.
- The migration `20260911044900_admin_orders_pagination_indexes.sql` adds created-at ordering indexes and trigram indexes for broad text search.
- Specialized control-center queues retain their existing client-side path until they are migrated to dedicated database-side queries.

This change does not mutate production order rows or pricing/payment rules.
