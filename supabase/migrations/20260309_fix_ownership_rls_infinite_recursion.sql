-- Fix infinite recursion in ownership RLS policies by using SECURITY DEFINER helpers
-- These functions bypass RLS, breaking the circular dependency

-- Step 1: Create SECURITY DEFINER helper functions
CREATE OR REPLACE FUNCTION public.is_member_of_account(p_account_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ownership_account_members
    WHERE account_id = p_account_id
    AND profile_id = auth.uid()
    AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_member_of_account(p_account_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ownership_account_members
    WHERE account_id = p_account_id
    AND profile_id = auth.uid()
    AND member_role = 'owner'
    AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_creator_of_account(p_account_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ownership_accounts
    WHERE id = p_account_id
    AND created_by_profile_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_of_account(p_account_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.property_managers pm
    JOIN public.properties p ON p.id = pm.property_id
    WHERE p.owner_account_id = p_account_id
    AND pm.manager_profile_id = auth.uid()
    AND pm.active = true
  );
$$;

-- Step 2: Drop broken policies on ownership_accounts
DROP POLICY IF EXISTS ownership_accounts_select_member_or_creator ON ownership_accounts;
DROP POLICY IF EXISTS ownership_accounts_insert_owner_or_manager ON ownership_accounts;
DROP POLICY IF EXISTS ownership_accounts_update_member_or_creator ON ownership_accounts;

-- Step 3: Drop broken policies on ownership_account_members
DROP POLICY IF EXISTS ownership_account_members_select_member_or_creator ON ownership_account_members;
DROP POLICY IF EXISTS ownership_account_members_insert_owner_or_creator ON ownership_account_members;
DROP POLICY IF EXISTS ownership_account_members_update_owner_or_creator ON ownership_account_members;

-- Step 4: Drop broken properties INSERT policy
DROP POLICY IF EXISTS properties_insert_admin_v2 ON properties;

-- Step 5: Recreate ownership_accounts policies (using helper functions)
CREATE POLICY ownership_accounts_select_member_or_creator ON ownership_accounts
  FOR SELECT USING (
    created_by_profile_id = auth.uid()
    OR is_member_of_account(id)
  );

CREATE POLICY ownership_accounts_insert_owner_or_manager ON ownership_accounts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('owner', 'manager'))
    AND created_by_profile_id = auth.uid()
  );

CREATE POLICY ownership_accounts_update_member_or_creator ON ownership_accounts
  FOR UPDATE USING (
    created_by_profile_id = auth.uid()
    OR is_owner_member_of_account(id)
  );

-- Step 6: Recreate ownership_account_members policies (using helper functions)
CREATE POLICY ownership_account_members_select_member_or_creator ON ownership_account_members
  FOR SELECT USING (
    profile_id = auth.uid()
    OR is_creator_of_account(account_id)
    OR is_owner_member_of_account(account_id)
  );

CREATE POLICY ownership_account_members_insert_owner_or_creator ON ownership_account_members
  FOR INSERT WITH CHECK (
    is_creator_of_account(account_id)
    OR is_owner_member_of_account(account_id)
  );

CREATE POLICY ownership_account_members_update_owner_or_creator ON ownership_account_members
  FOR UPDATE USING (
    is_creator_of_account(account_id)
    OR is_owner_member_of_account(account_id)
  );

-- Step 7: Recreate properties INSERT admin policy (using helper functions)
CREATE POLICY properties_insert_admin_v2 ON properties
  FOR INSERT WITH CHECK (
    owner_account_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('owner', 'manager'))
    AND (is_member_of_account(owner_account_id) OR is_creator_of_account(owner_account_id))
  );

-- Step 8: Fix vendors policies
DROP POLICY IF EXISTS vendors_select_account_admin_v2 ON vendors;
DROP POLICY IF EXISTS vendors_insert_account_admin_v2 ON vendors;
DROP POLICY IF EXISTS vendors_update_account_admin_v2 ON vendors;

CREATE POLICY vendors_select_account_admin_v2 ON vendors
  FOR SELECT USING (
    owner_account_id IS NOT NULL
    AND (is_member_of_account(owner_account_id) OR is_creator_of_account(owner_account_id) OR is_manager_of_account(owner_account_id))
  );

CREATE POLICY vendors_insert_account_admin_v2 ON vendors
  FOR INSERT WITH CHECK (
    owner_account_id IS NOT NULL
    AND (is_member_of_account(owner_account_id) OR is_creator_of_account(owner_account_id) OR is_manager_of_account(owner_account_id))
  );

CREATE POLICY vendors_update_account_admin_v2 ON vendors
  FOR UPDATE USING (
    owner_account_id IS NOT NULL
    AND (is_member_of_account(owner_account_id) OR is_creator_of_account(owner_account_id) OR is_manager_of_account(owner_account_id))
  );

-- Step 9: Fix document_templates policies
DROP POLICY IF EXISTS document_templates_select_account_admin_v2 ON document_templates;
DROP POLICY IF EXISTS document_templates_insert_account_admin_v2 ON document_templates;
DROP POLICY IF EXISTS document_templates_update_account_admin_v2 ON document_templates;
DROP POLICY IF EXISTS document_templates_delete_account_admin_v2 ON document_templates;

CREATE POLICY document_templates_select_account_admin_v2 ON document_templates
  FOR SELECT USING (
    owner_account_id IS NOT NULL
    AND (is_owner_member_of_account(owner_account_id) OR is_creator_of_account(owner_account_id) OR is_manager_of_account(owner_account_id))
  );

CREATE POLICY document_templates_insert_account_admin_v2 ON document_templates
  FOR INSERT WITH CHECK (
    owner_account_id IS NOT NULL
    AND (is_owner_member_of_account(owner_account_id) OR is_creator_of_account(owner_account_id) OR is_manager_of_account(owner_account_id))
  );

CREATE POLICY document_templates_update_account_admin_v2 ON document_templates
  FOR UPDATE USING (
    owner_account_id IS NOT NULL
    AND (is_owner_member_of_account(owner_account_id) OR is_creator_of_account(owner_account_id) OR is_manager_of_account(owner_account_id))
  );

CREATE POLICY document_templates_delete_account_admin_v2 ON document_templates
  FOR DELETE USING (
    owner_account_id IS NOT NULL
    AND (is_owner_member_of_account(owner_account_id) OR is_creator_of_account(owner_account_id))
  );

-- Step 10: Fix invitations INSERT policy
DROP POLICY IF EXISTS invitations_insert_admin_v2 ON invitations;

CREATE POLICY invitations_insert_admin_v2 ON invitations
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
    AND (
      (role = 'owner' AND ownership_account_id IS NOT NULL AND is_owner_member_of_account(ownership_account_id))
      OR (role = 'manager' AND property_id IS NOT NULL AND can_administer_property(property_id))
      OR (role = 'tenant' AND EXISTS (SELECT 1 FROM properties p WHERE can_administer_property(p.id)))
    )
  );
