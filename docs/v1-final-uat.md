# V1 Final UAT Checklist

## Preconditions
1. `npm run verify:phase9-runtime` returns `ok: true`.
2. Production deployment is completed from latest `main`.
3. Smoke check passes against production URL.

## Owner UAT (Individual + LLC Co-owner)
1. Owner can sign in and land in role portal flow.
2. Owner can view property/unit/lease data without errors.
3. Owner can create/update operational records:
   1. property
   2. unit
   3. lease
4. Owner can manage documents:
   1. create template
   2. create packet
   3. send packet
5. Owner can manage maintenance:
   1. view ticket
   2. assign vendor
   3. upload photo
6. Co-owner in same LLC can access and operate the same property scope.

## Manager UAT (Manager-Only Operating Path)
1. Manager can sign in and access assigned property workflows.
2. Manager can perform full operational controls on assigned properties:
   1. leases
   2. charges
   3. maintenance status
   4. vendor assignment
   5. tenant invitation actions
3. Manager cannot access properties not assigned to manager.

## Tenant UAT
1. Tenant can sign in and load tenant workspace.
2. Tenant can view outstanding charges.
3. Tenant payment action opens checkout path.
4. Tenant can create maintenance ticket.
5. Tenant can view ticket list/status.
6. Tenant can view document packets and signing status.

## Security and Access UAT
1. Unauthenticated requests to `/owner`, `/manager`, `/tenant`, `/portal` redirect to `/login`.
2. Unauthenticated access to private asset endpoints returns `401`.
3. Cross-role unauthorized admin actions fail cleanly.

## Release Gate
1. `npm test --workspace @rental/web`
2. `npm run lint:web`
3. `npm run build:web`
4. `npx tsc -p /Users/courtneysmith/Documents/Codex/Rental Properties/apps/mobile/tsconfig.json --noEmit`
5. `APP_URL=https://rental-properties-platform-web.vercel.app npm run smoke:web`

## Exit Criteria For Tag
1. All UAT sections pass with no P0/P1 defects.
2. No unresolved DB/runtime blockers remain.
3. Deploy is live on latest commit.
4. Tag release: `v1.0.0`.
