# Smoke Accounts

`scripts/seed-smoke-accounts.mjs` provisions three dedicated production-safe smoke users:
- owner: isolated landlord account
- manager: assigned only to the smoke property
- tenant: active lease on `Smoke Test Property` / `Unit S`

The tenant lease is fixed at `$1.00/month` (`100` cents), below the online payment minimum, so the smoke tenant cannot pay real rent by accident.

Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMOKE_OWNER_EMAIL`, `SMOKE_OWNER_PASSWORD`
- `SMOKE_MANAGER_EMAIL`, `SMOKE_MANAGER_PASSWORD`
- `SMOKE_TENANT_EMAIL`, `SMOKE_TENANT_PASSWORD`

Behavior:
- additive and idempotent
- refuses to touch a pre-existing non-smoke auth user with the same email
- creates only the isolated smoke property/account/lease graph

Credential rotation:
- keep the three smoke emails stable
- change one or more `SMOKE_*_PASSWORD` values
- rerun `node scripts/seed-smoke-accounts.mjs`
- the script updates only users already marked as smoke accounts

If an email must change, remove the old smoke account manually in Supabase Auth first, then rerun the seed with the new email.
