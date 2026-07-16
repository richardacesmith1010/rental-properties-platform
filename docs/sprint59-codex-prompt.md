# Sprint 59 — Codex Implementation Prompt

## 1. Objective

Add PDF receipt generation for rent payments so tenants can download professional receipts and owners can export payment records for tax purposes.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 58)
- **Production URL**: `https://domusbase.com`
- **Existing infrastructure**:
  - `app/payments/receipt/[chargeId]/page.tsx` — receipt page already exists (HTML view)
  - `app/payments/receipt/[chargeId]/loading.tsx` — loading state exists
  - Charges have: id, amountCents, status, dueDate, paidAt, tenant profile, property, unit info
  - Reports page has "Export CSV" button pattern already
  - No PDF library currently installed

## 3. In Scope

### Part A: PDF Generation Library
- Install `@react-pdf/renderer` for server-side PDF generation
- Create a reusable PDF receipt template component

### Part B: Payment Receipt PDF
- Professional receipt with Domus branding (purple header, logo)
- Includes: tenant name, property address, unit, amount paid, payment date, receipt number, payment method
- "Download Receipt" button on the existing receipt page
- API route that generates and returns the PDF

### Part C: Bulk Receipt Export
- Owner can export all receipts for a date range as a ZIP or combined PDF
- Useful for tax season — "Export All 2025 Receipts" button on reports page
- Uses existing reports page infrastructure

### Part D: Lease Summary PDF
- One-page lease summary showing: property, unit, tenant, rent amount, lease dates, terms
- Available from the lease detail view
- Not a full legal document — just a reference summary

## 4. Out of Scope

- Full legal lease document generation (complex formatting, signatures)
- Invoice generation (separate from receipts)
- Automated receipt emailing (future — requires Resend)
- Batch PDF merge into single file
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (5-6)
1. `apps/web/lib/pdf/receipt-template.tsx` — React PDF receipt component
2. `apps/web/lib/pdf/lease-summary-template.tsx` — React PDF lease summary component
3. `apps/web/lib/pdf/pdf-styles.ts` — shared PDF styling (colors, fonts, spacing)
4. `apps/web/app/api/pdf/receipt/[chargeId]/route.ts` — PDF generation API route
5. `apps/web/app/api/pdf/lease-summary/[leaseId]/route.ts` — lease summary PDF route
6. `apps/web/lib/__tests__/pdf-receipt.test.ts` — unit tests

### Modified Files (3-4)
1. `apps/web/app/payments/receipt/[chargeId]/page.tsx` — add "Download PDF" button
2. `apps/web/app/owner/reports/page.tsx` or report component — add "Export Receipts PDF" button
3. `apps/web/components/dashboard/leases-section.tsx` — add "Download Summary" button on lease cards
4. `package.json` — add `@react-pdf/renderer` dependency

## 6. Implementation Requirements

### Part A: Install Dependencies

```bash
npm install @react-pdf/renderer --workspace=apps/web
```

Note: `@react-pdf/renderer` works server-side in Next.js API routes. It renders React components to PDF buffers.

### Part B: PDF Styles

**File: `lib/pdf/pdf-styles.ts`**

```typescript
import { StyleSheet } from "@react-pdf/renderer";

export const colors = {
  primary: "#7c3aed",      // Domus purple
  primaryLight: "#ede9fe",  // light purple background
  success: "#10b981",       // green for paid
  text: "#1f2937",          // dark gray
  textMuted: "#6b7280",     // medium gray
  border: "#e5e7eb",        // light gray
  white: "#ffffff",
};

export const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: colors.text,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  brandName: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
  },
  brandSubtitle: {
    fontSize: 8,
    color: colors.textMuted,
    marginTop: 2,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: colors.text,
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: 10,
    color: colors.textMuted,
    width: "40%",
  },
  value: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.text,
    width: "60%",
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginTop: 10,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  totalValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: colors.textMuted,
  },
  badge: {
    backgroundColor: colors.success,
    color: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
});
```

### Part C: Receipt Template

**File: `lib/pdf/receipt-template.tsx`**

```tsx
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, colors } from "./pdf-styles";

interface ReceiptData {
  receiptNumber: string;       // charge ID or formatted number
  tenantName: string;
  propertyAddress: string;
  unitLabel: string;
  amountFormatted: string;     // "$1,200.00"
  dueDate: string;             // formatted date
  paidDate: string;            // formatted date
  paymentMethod?: string;      // "Stripe" or "Manual"
  leaseLabel?: string;         // "Lease #123" or date range
}

// Structure:
// - Header: "Domus" brand name + "RENTAL COMMAND CENTER" subtitle | Receipt date
// - Title: "Payment Receipt"
// - Status badge: "PAID" in green
// - Detail rows: Tenant, Property, Unit, Lease Period, Amount, Due Date, Payment Date, Method
// - Total row with amount highlighted
// - Footer: "Generated by Domus — domusbase.com" + generation timestamp
```

### Part D: Receipt API Route

**File: `app/api/pdf/receipt/[chargeId]/route.ts`**

```typescript
import { renderToBuffer } from "@react-pdf/renderer";

export async function GET(request: Request, { params }: { params: { chargeId: string } }) {
  // 1. Authenticate user (createClient pattern)
  // 2. Fetch charge by ID with tenant profile, property, unit joins
  // 3. Verify user is the tenant OR property owner/manager
  // 4. Build ReceiptData from charge
  // 5. Render PDF:
  //    const buffer = await renderToBuffer(<ReceiptDocument data={receiptData} />);
  // 6. Return Response with PDF headers:
  //    Content-Type: application/pdf
  //    Content-Disposition: attachment; filename="domus-receipt-{chargeId}.pdf"
}
```

### Part E: Lease Summary Template

**File: `lib/pdf/lease-summary-template.tsx`**

Similar structure to receipt but with:
- Property details (address, unit)
- Tenant info (name, email)
- Lease dates (start, end, duration)
- Monthly rent amount
- Lease status (active/expired)
- Any special terms or notes

### Part F: Lease Summary API Route

**File: `app/api/pdf/lease-summary/[leaseId]/route.ts`**

Same auth pattern as receipt. User must be tenant, owner, or manager.

### Part G: UI Buttons

**Receipt page** (`app/payments/receipt/[chargeId]/page.tsx`):
```tsx
<a
  href={`/api/pdf/receipt/${chargeId}`}
  download
  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white"
>
  <DownloadIcon className="w-4 h-4" />
  Download PDF
</a>
```

**Reports page**: Add "Export Receipts" button that links to a PDF generation route for all receipts in the selected year.

**Leases section**: Add small "PDF" icon button on lease cards.

### Part H: Unit Tests

Test:
1. Receipt data formatting (cents → formatted currency)
2. Receipt number generation
3. API route returns 401 for unauthenticated requests
4. API route returns 403 for unauthorized users
5. API route returns 404 for non-existent charge

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `@react-pdf/renderer` installed and working in API routes
2. [ ] Receipt PDF generates with Domus branding, all payment details, and "PAID" badge
3. [ ] "Download PDF" button on receipt page triggers PDF download
4. [ ] Lease summary PDF generates with property, tenant, and lease details
5. [ ] PDF API routes enforce authentication and authorization
6. [ ] Receipt accessible only to tenant, owner, or manager
7. [ ] PDF filename is descriptive: `domus-receipt-{id}.pdf`
8. [ ] Reports page has "Export Receipts" button for batch export
9. [ ] 5+ unit tests passing
10. [ ] `npm run gate:web` passes
11. [ ] No regressions to existing receipt page or reports

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
RECEIPT_PDF: working | broken
LEASE_SUMMARY_PDF: working | broken
DOWNLOAD_BUTTON: working | broken
AUTH_CHECKS: passing | failing
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations (no new tables needed)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Only install `@react-pdf/renderer` — no other PDF libraries
- PDFs must be generated server-side (API routes), never client-side
- All PDF routes must check authentication AND authorization
- Use Helvetica font only (built into @react-pdf, no custom font files needed)
