# Compact Partner order

User request: shorten the very long mobile New Partner order shown in screenshots and complete this existing flow. Implement directly under the user's existing authorization.

Use the existing React form and draft RPC, presented in four short steps: Route, Cargo & truck, Schedule & contacts, Review. Keep input DOM mounted so Back/Next preserves typed values, use explicit per-step native validation and prevent implicit Enter from saving early. Optional fields use disclosure groups, automatically opened when invalid. Review shows route, cargo, schedule, contacts and payment before the explicit Save draft. Do not remove required backend fields, invent geocoded administrative fields, enable the unfinished Smart Order V2 flag, change pricing, approval, payment or submission rules. Touch targets remain 44px or greater; native date/time controls fit mobile widths.

Alternatives: tighter spacing alone still leaves a long mobile form; deleting backend-required fields breaks drafts. A four-step form reuses existing behavior and has the lowest compatibility risk. This implementation choice is the agent's interpretation of the screenshot-backed request.
