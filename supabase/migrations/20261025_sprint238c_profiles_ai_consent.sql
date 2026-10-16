-- Sprint 238c: record when a user agreed to send Ask Domus questions + rental details to Anthropic.
-- Null = no consent (the API refuses). Written only by the service role via a server action (profiles writes are
-- service-role only since Sprint 237e); no client grants change.
alter table public.profiles add column if not exists ai_consent_at timestamptz null;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'ai_consent_at' and data_type = 'timestamp with time zone' and is_nullable = 'YES')
     or has_column_privilege('authenticated', 'public.profiles', 'ai_consent_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'ai_consent_at', 'INSERT')
     or has_column_privilege('anon', 'public.profiles', 'ai_consent_at', 'UPDATE') then
    raise exception 'sprint238c postcondition failed';
  end if;
end $$;
