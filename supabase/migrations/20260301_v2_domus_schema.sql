-- V2 "Domus" Schema Migration
-- Applied to live Supabase by Claude via MCP on 2026-03-01
-- This file is the local reference for Codex app code.

-- =============================================================
-- Phase 2: Soft-delete support for properties and units
-- =============================================================
ALTER TABLE properties ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE units ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- =============================================================
-- Phase 3b: Preferred vendors and trade categorization
-- =============================================================
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS preferred boolean NOT NULL DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS trade_category text;
ALTER TABLE vendors ADD CONSTRAINT vendors_trade_category_check
  CHECK (trade_category IS NULL OR trade_category IN (
    'plumbing', 'electrical', 'hvac', 'general', 'landscaping',
    'cleaning', 'roofing', 'painting', 'appliance', 'other'
  ));

-- =============================================================
-- Phase 3a: Document vault
-- =============================================================
CREATE TABLE IF NOT EXISTS property_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  uploaded_by_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_type text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'lease_agreement', 'inspection', 'insurance', 'tax', 'receipt', 'other'
  )),
  visibility text NOT NULL CHECK (visibility IN ('owner_manager', 'all')) DEFAULT 'owner_manager',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE property_files ENABLE ROW LEVEL SECURITY;

-- Storage bucket for property files
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-files', 'property-files', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- Phase 4: Expense tracking
-- =============================================================
CREATE TABLE IF NOT EXISTS property_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_by_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN (
    'mortgage', 'insurance', 'property_tax', 'hoa', 'repair',
    'maintenance', 'utility', 'management_fee', 'legal', 'other'
  )),
  description text,
  amount_cents int NOT NULL CHECK (amount_cents > 0),
  expense_date date NOT NULL,
  recurring boolean NOT NULL DEFAULT false,
  recurring_frequency text CHECK (
    recurring_frequency IS NULL OR recurring_frequency IN ('monthly', 'quarterly', 'annually')
  ),
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  receipt_file_id uuid REFERENCES property_files(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE property_expenses ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- Phase 5a: Tester/diagnostics mode
-- =============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_tester boolean NOT NULL DEFAULT false;

-- =============================================================
-- RLS Policies: property_files
-- =============================================================
CREATE POLICY "property_files_select_admin" ON property_files
FOR SELECT USING (
  public.can_administer_property(property_id)
);

CREATE POLICY "property_files_select_tenant" ON property_files
FOR SELECT USING (
  visibility = 'all'
  AND EXISTS (
    SELECT 1 FROM leases l
    JOIN units u ON u.id = l.unit_id
    WHERE u.property_id = property_files.property_id
      AND l.tenant_profile_id = auth.uid()
      AND l.active = true
  )
);

CREATE POLICY "property_files_insert_admin" ON property_files
FOR INSERT WITH CHECK (
  public.can_administer_property(property_id)
);

CREATE POLICY "property_files_update_admin" ON property_files
FOR UPDATE USING (
  public.can_administer_property(property_id)
);

CREATE POLICY "property_files_delete_admin" ON property_files
FOR DELETE USING (
  public.can_administer_property(property_id)
);

-- Storage policies for property-files bucket
CREATE POLICY "property_files_storage_select" ON storage.objects
FOR SELECT USING (
  bucket_id = 'property-files' AND auth.role() = 'authenticated'
);

CREATE POLICY "property_files_storage_insert" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'property-files' AND auth.role() = 'authenticated'
);

CREATE POLICY "property_files_storage_delete" ON storage.objects
FOR DELETE USING (
  bucket_id = 'property-files' AND auth.role() = 'authenticated'
);

-- =============================================================
-- RLS Policies: property_expenses (owner/manager only)
-- =============================================================
CREATE POLICY "property_expenses_select_admin" ON property_expenses
FOR SELECT USING (
  public.can_administer_property(property_id)
);

CREATE POLICY "property_expenses_insert_admin" ON property_expenses
FOR INSERT WITH CHECK (
  public.can_administer_property(property_id)
);

CREATE POLICY "property_expenses_update_admin" ON property_expenses
FOR UPDATE USING (
  public.can_administer_property(property_id)
);

CREATE POLICY "property_expenses_delete_admin" ON property_expenses
FOR DELETE USING (
  public.can_administer_property(property_id)
);
