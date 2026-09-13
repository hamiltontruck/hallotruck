# Compact Admin driver documents

Implemented and locally validated on main 306dabd504c78b7bfebebf1d39df10a6fb04ddfb; published for review on main 8356d19683ca8aaa00894952b4afa324da7ca368. The intervening changes concern Driver Android and its dispute migration.

Five groups contain eight required files, in this order: driver photo; license front/back; National ID front/back; one vehicle registration photo/PDF; truck front/side photos. License and National ID each require one expiry date on their front record. Neither back has a second expiry field. Switching document type or driver clears the draft expiry to prevent carrying the wrong date across documents. Previous evidence and audit records remain stored and accessible through history.

Driver name, canonical truck type and descriptive truck model are editable above the document groups. Save uses database-backed leadership authorization, stale-value protection and assignment checks. Truck changes are blocked during an active trip. Private previews use five-minute signed URLs. File metadata and review actions appear inside the preview dialog rather than stretching the list.

## Validation

| Check | Result |
| --- | --- |
| Strict TypeScript, script syntax, source hygiene | PASS |
| Regression tests | 371 passed, 0 failed |
| PostgreSQL migration contracts in isolated PGlite fixture | 35 passed |
| Production build | PASS; existing large-bundle warning remains |
| Admin browser smoke | PASS at 320, 360, 390, 412, 430 and 768 CSS pixels |
| Document grouping, compact height, metadata hidden | PASS |
| License and National ID dialogs: one expiry each, none on backs | PASS |
| Close and focus restoration | PASS |
| Additional 390px keyboard Tab/Escape interaction | PASS |

Screenshots are real component renders using synthetic test documents, not production driver evidence. Browser checks used Chromium through Playwright with a local CLI adapter; the checked-in smoke assertions ran unchanged.

- [Five compact groups](five-compact-groups-390.png)
- [Driver and truck fields](driver-truck-fields-390.png)
- [License detail dialog](license-details-390.png)
- [National ID detail dialog](national-id-details-390.png)

## Release boundary

Migration `20260913010906_compact_driver_verification.sql` is prepared and tested locally, but has NOT been applied to production. Production storage access, authenticated field saves and document review have NOT been retested against live data. Driver Android and its upload screens are outside this change. Existing Driver web upload options are unchanged; the shared required-progress count is eight.

Before deployment, review/apply the migration and verify it, then advance `supabase/production-migration-version.txt` in a reviewed change. Do not advance that marker without applying the migration. The existing deployment gate intentionally blocks publication while production is behind.

Repository publication is authorized. This review branch does not merge or deploy automatically; production migration application and the deployment marker remain pending.
