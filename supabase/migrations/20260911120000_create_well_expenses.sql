-- Migration: create_well_expenses
-- Description: Records well expenses, specifically SMS service costs from Kavenegar

CREATE TABLE IF NOT EXISTS public.well_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  well_id UUID NOT NULL REFERENCES public.wells(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'هزینه سرویس پیامکی',
  cost BIGINT NOT NULL DEFAULT 0,
  expense_type TEXT NOT NULL DEFAULT 'sms',
  recipient_phone TEXT,
  recipient_name TEXT,
  message_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast retrieval of well expenses ordered by latest date
CREATE INDEX IF NOT EXISTS idx_well_expenses_well_id_created ON public.well_expenses(well_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.well_expenses ENABLE ROW LEVEL SECURITY;

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.well_expenses TO authenticated;
GRANT ALL ON public.well_expenses TO service_role;

-- RLS Policies
DROP POLICY IF EXISTS well_expenses_select ON public.well_expenses;
CREATE POLICY well_expenses_select ON public.well_expenses
FOR SELECT
TO authenticated
USING (private.can_view_well(well_id));

DROP POLICY IF EXISTS well_expenses_insert ON public.well_expenses;
CREATE POLICY well_expenses_insert ON public.well_expenses
FOR INSERT
TO authenticated
WITH CHECK (private.can_manage_well(well_id));

DROP POLICY IF EXISTS well_expenses_update ON public.well_expenses;
CREATE POLICY well_expenses_update ON public.well_expenses
FOR UPDATE
TO authenticated
USING (private.can_manage_well(well_id))
WITH CHECK (private.can_manage_well(well_id));

DROP POLICY IF EXISTS well_expenses_delete ON public.well_expenses;
CREATE POLICY well_expenses_delete ON public.well_expenses
FOR DELETE
TO authenticated
USING (private.is_admin());
