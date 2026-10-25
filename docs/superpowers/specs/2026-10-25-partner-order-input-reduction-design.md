# Reduce actual Partner order inputs

The user corrected the previous release: pagination alone did not reduce repeated questions, neighborhood search was difficult, and browser-filled pickup/drop-off metadata could match despite different selected endpoints.

Use provider location context as the canonical country/region/city; remove the eight repeated manual address metadata fields. Keep two independent search choices plus optional landmark instructions; ask for town only when a selected provider result has none. Unknown metadata stays unknown. Include precise address/neighborhood/POI results alongside exact cities without changing shared Customer geocoding. Search results must have valid coordinates. Selecting pickup must retain focus there and never alter destination.

Cargo's essential inputs are description, positive tons and truck type; category/quantity/capacity move to optional settings. Explicitly explain default quantity 1, general goods category and minimum capacity equal to load weight unless overridden. Keep both pickup and delivery contacts independent, with optional user-checked same-contact reuse; never copy a pickup location or contact silently. Emails and scheduling extras remain optional. Existing draft, HALLO pricing/review/payment authority and database contract remain unchanged.

Approach: reuse the existing four-step form with structured selected-place data, rather than hide still-required questions or remove backend safety checks. No new dependencies, schema changes or invented contacts/coordinates.
