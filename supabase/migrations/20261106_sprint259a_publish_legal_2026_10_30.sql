-- Sprint 259a: publish Terms of Service and Privacy Policy version 2026-10-30. Each SHA-256 is of the archived text
-- (apps/web/legal-archive/{terms,privacy}/2026-10-30.txt) and equals LEGAL_DOCUMENTS in apps/web/lib/legal-versions.ts.
-- legal_document_versions is append-only: to change a published text, publish a new version (docs/runbooks/terms-change.md).
insert into public.legal_document_versions (document, version, sha256) values
  ('terms', '2026-10-30', 'd9f5bae5103bae8db4851a6d30f0283f3c92017ba045d813b4b3c388bcb95b7d'),
  ('privacy', '2026-10-30', 'e698a76b026206ae3d8553fcef451dd867d06cc80fbe0734b647dc60d2f865c3')
on conflict (document, version) do nothing;

do $$
begin
  if (select count(*) from public.legal_document_versions
      where (document, version, sha256) in (
        ('terms', '2026-10-30', 'd9f5bae5103bae8db4851a6d30f0283f3c92017ba045d813b4b3c388bcb95b7d'),
        ('privacy', '2026-10-30', 'e698a76b026206ae3d8553fcef451dd867d06cc80fbe0734b647dc60d2f865c3'))) <> 2 then
    raise exception 'sprint259a publish postcondition failed';
  end if;
end $$;
