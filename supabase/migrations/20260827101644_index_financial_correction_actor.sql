create index financial_corrections_actor_idx
  on public.financial_corrections(actor_id, created_at desc);
