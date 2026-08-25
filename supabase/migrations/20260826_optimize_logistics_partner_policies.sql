drop policy if exists partner_org_admin_write on public.partner_organizations;
create policy partner_org_admin_insert on public.partner_organizations for insert to authenticated with check (private.is_admin_or_ceo());
create policy partner_org_admin_update on public.partner_organizations for update to authenticated using (private.is_admin_or_ceo()) with check (private.is_admin_or_ceo());
create policy partner_org_admin_delete on public.partner_organizations for delete to authenticated using (private.is_admin_or_ceo());

drop policy if exists partner_members_admin_write on public.partner_memberships;
create policy partner_members_admin_insert on public.partner_memberships for insert to authenticated with check (private.is_admin_or_ceo());
create policy partner_members_admin_update on public.partner_memberships for update to authenticated using (private.is_admin_or_ceo()) with check (private.is_admin_or_ceo());
create policy partner_members_admin_delete on public.partner_memberships for delete to authenticated using (private.is_admin_or_ceo());

drop policy if exists partner_projects_write on public.partner_projects;
create policy partner_projects_insert on public.partner_projects for insert to authenticated with check (private.can_manage_partner(partner_id));
create policy partner_projects_update on public.partner_projects for update to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_projects_delete on public.partner_projects for delete to authenticated using (private.can_manage_partner(partner_id));

drop policy if exists partner_progress_write on public.partner_project_progress;
create policy partner_progress_insert on public.partner_project_progress for insert to authenticated with check (private.can_manage_partner(partner_id));
create policy partner_progress_update on public.partner_project_progress for update to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_progress_delete on public.partner_project_progress for delete to authenticated using (private.can_manage_partner(partner_id));

drop policy if exists partner_payments_write on public.partner_payments;
create policy partner_payments_insert on public.partner_payments for insert to authenticated with check (private.can_manage_partner(partner_id));
create policy partner_payments_update on public.partner_payments for update to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_payments_delete on public.partner_payments for delete to authenticated using (private.can_manage_partner(partner_id));

drop policy if exists partner_folders_write on public.partner_folders;
create policy partner_folders_insert on public.partner_folders for insert to authenticated with check (private.can_manage_partner(partner_id));
create policy partner_folders_update on public.partner_folders for update to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_folders_delete on public.partner_folders for delete to authenticated using (private.can_manage_partner(partner_id));

drop policy if exists partner_documents_write on public.partner_documents;
create policy partner_documents_insert on public.partner_documents for insert to authenticated with check (private.can_manage_partner(partner_id));
create policy partner_documents_update on public.partner_documents for update to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_documents_delete on public.partner_documents for delete to authenticated using (private.can_manage_partner(partner_id));

drop policy if exists partner_reviews_write on public.partner_document_reviews;
create policy partner_reviews_insert on public.partner_document_reviews for insert to authenticated with check (private.can_manage_partner(partner_id));
create policy partner_reviews_update on public.partner_document_reviews for update to authenticated using (private.can_manage_partner(partner_id)) with check (private.can_manage_partner(partner_id));
create policy partner_reviews_delete on public.partner_document_reviews for delete to authenticated using (private.can_manage_partner(partner_id));

create index if not exists partner_organizations_created_by_idx on public.partner_organizations(created_by);
create index if not exists partner_memberships_invited_by_idx on public.partner_memberships(invited_by);
create index if not exists partner_projects_created_by_idx on public.partner_projects(created_by);
create index if not exists partner_progress_partner_idx on public.partner_project_progress(partner_id);
create index if not exists partner_progress_project_idx on public.partner_project_progress(project_id);
create index if not exists partner_progress_created_by_idx on public.partner_project_progress(created_by);
create index if not exists partner_payments_project_idx on public.partner_payments(project_id);
create index if not exists partner_payments_created_by_idx on public.partner_payments(created_by);
create index if not exists partner_folders_partner_idx on public.partner_folders(partner_id);
create index if not exists partner_folders_project_idx on public.partner_folders(project_id);
create index if not exists partner_folders_parent_idx on public.partner_folders(parent_id);
create index if not exists partner_folders_created_by_idx on public.partner_folders(created_by);
create index if not exists partner_documents_project_idx on public.partner_documents(project_id);
create index if not exists partner_documents_folder_idx on public.partner_documents(folder_id);
create index if not exists partner_documents_uploaded_by_idx on public.partner_documents(uploaded_by);
create index if not exists partner_reviews_partner_idx on public.partner_document_reviews(partner_id);
create index if not exists partner_reviews_document_idx on public.partner_document_reviews(document_id);
create index if not exists partner_reviews_reviewed_by_idx on public.partner_document_reviews(reviewed_by);
create index if not exists partner_activity_actor_idx on public.partner_activity_log(actor_id);
create index if not exists partner_messages_project_idx on public.partner_messages(project_id);
create index if not exists partner_messages_sender_idx on public.partner_messages(sender_id);
