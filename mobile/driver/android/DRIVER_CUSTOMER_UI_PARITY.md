# Driver Android Customer UI parity

This branch keeps Driver Android on native Kotlin/XML and preserves the existing Driver Supabase/session/jobs/trip/wallet/document contracts.

Visual reference: the current Customer Android authentication and Material 3 language/card system.

Implemented here:
- official HALLO logo and driver truck hero on auth
- EN / OR / Amharic auth selector
- Customer-style white sign-in/sign-up card
- icon-assisted email and PIN fields with password visibility
- 6-digit driver signup PIN and confirmation retained
- blue primary CTA plus outlined mode action
- responsive 24dp auth spacing without double host padding
- 16dp content/metric cards, 52dp primary actions, 14dp inputs, filled danger action
- dynamic Driver job/history/notification cards aligned to the same card radius and spacing

No Driver backend, Supabase schema, RLS, finance calculation, job assignment, GPS, delivery proof, or role-validation behavior is changed.
