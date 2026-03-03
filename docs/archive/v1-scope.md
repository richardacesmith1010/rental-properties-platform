# V1 Scope (Locked)

## Product Context
- Initial portfolio: 1 single-family property
- Initial operator: owner only
- Architecture must support 3 roles from day one: owner, manager, tenant
- Property manager role must remain optional (owner can run solo)

## V1 Success Definition
V1 is ready when the product skeleton is complete and all minimum installed features work reliably in real use.

## Roles and Access
- Owner: full access
- Manager: operational access (enabled but optional in V1 launch)
- Tenant: self-service access (enabled for invited tenants)
- Login should provide role-oriented entry points, but backend authorization controls real access.

## Required V1 Features

### 1) Auth and Identity
- Passwordless email login
- Role-aware routing and permissions
- Invitation-ready user model for future manager/tenant onboarding

### 2) Property Operations
- Property, unit, and lease management (owner first)
- Occupancy and lease visibility

### 3) Real Online Rent Payments
- Tenant-facing payment flow (ACH/card ready)
- Payment status tracking and owner visibility
- Late rent identification

### 4) Maintenance Operations
- Tenant ticket creation
- Owner assignment to vendor
- Cost tracking (estimated and actual)
- Photo attachments

### 5) Communication
- Record of communication events
- Email and SMS support path (at minimum: logging and trigger points)

### 6) Documents
- Document repository by property/lease
- E-sign and templates included in V1

### 7) Notifications
Mandatory alerts in V1:
- New maintenance ticket
- Late rent

### 8) Dashboards
- Owner dashboard first with complete operational visibility
- Tenant and manager dashboards included at skeleton level with role-appropriate data
- Accounting in V1 is dashboard-only (no export integrations yet)

## Explicitly Deferred (Post-V1)
- Tenant screening and full leasing pipeline
- Advanced accounting exports/integrations

## Build Order (Implementation)
1. Role architecture and role-based routing (owner/manager/tenant)
2. Payment integration foundation (real online payments)
3. Maintenance + vendor assignment + photos
4. Notifications for new ticket and late rent
5. Documents with template + e-sign workflow
6. Role-specific dashboard refinement and UX polish
