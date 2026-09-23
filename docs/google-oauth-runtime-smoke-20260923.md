# Google OAuth Runtime Smoke — Customer + Driver

Follow-up validation for merged PR #461. This PR is validation-only until a runtime defect requires a code fix.

## Safety
- Do not use production data for smoke users.
- Prefer local or isolated Supabase validation.
- Do not mark a flow PASS without real Google OAuth completion and database verification.

## Customer smoke
- Fresh Google sign-in completes successfully.
- New identity is routed to Customer onboarding, never Driver/Admin/CEO/Partner.
- Name and phone completion succeeds.
- Customer profile and CRM customer link are created.
- Stable Customer public code is present.

## Driver smoke
- Fresh Google sign-in completes successfully.
- Driver onboarding requires phone, plate, and all 8 required documents.
- Submission leaves Driver in pending review state.
- Driver public code is present.
- No Admin/CEO/Partner role escalation is possible.

## Exit gate
Both flows must PASS with runtime evidence before this PR is marked ready for review.