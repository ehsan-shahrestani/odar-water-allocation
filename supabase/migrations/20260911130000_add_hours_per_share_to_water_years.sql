-- Migration: Add hours_per_share to water_years table
ALTER TABLE public.water_years
ADD COLUMN IF NOT EXISTS hours_per_share numeric DEFAULT NULL;

COMMENT ON COLUMN public.water_years.hours_per_share IS 'معادل ساعت آب به ازای هر ساعت مالکیت (سهم) کشاورز از چاه';
