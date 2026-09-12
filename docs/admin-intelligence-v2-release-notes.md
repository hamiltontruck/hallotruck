# Admin Intelligence V2 release notes

- Full-history browser preload removed from the production Admin Intelligence route.
- KPI/report aggregation moved to PostgreSQL.
- Global search moved to PostgreSQL with exact category counts and bounded pages.
- Search page state is URL-backed via `search_page`.
- Report ranges use `Africa/Addis_Ababa` day boundaries for today, 7d, 30d, and 90d.
- Existing drill-down destinations remain available for Orders, Payment Review, Driver Finance Search, Fleet, Pricing, and CEO Overview.
- Realtime events trigger a debounced server report refresh instead of re-downloading complete histories.
