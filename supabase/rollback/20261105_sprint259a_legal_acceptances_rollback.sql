-- Rollback for Sprint 259a (20261105_sprint259a_legal_acceptances.sql and any publish migration after it).
-- Run only after the 259a app code is rolled back: the gate reads legal_acceptances on signed-in pages and actions.
-- Dropping the tables deletes every agreement record. Export them first if any real person has agreed:
--   select * from public.legal_acceptances order by recorded_at;
--   select * from public.legal_document_versions order by document, version;
drop trigger if exists profiles_keep_legal_evidence on public.profiles;
drop function if exists public.profiles_keep_legal_evidence();
drop function if exists public.purge_expired_legal_acceptances(text);
drop table if exists public.legal_acceptances;
drop table if exists public.legal_holds;
drop table if exists public.legal_document_versions;
drop function if exists public.legal_acceptances_append_only();
drop function if exists public.legal_documents_append_only();
