-- Migration: Add quantity column to attendee_field_status table
-- Run this in your Supabase SQL editor

-- Add quantity column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'attendee_field_status' 
        AND column_name = 'quantity'
    ) THEN
        ALTER TABLE public.attendee_field_status 
        ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1);
    END IF;
END $$;

-- Update existing records to have quantity = 1
UPDATE public.attendee_field_status 
SET quantity = 1 
WHERE quantity IS NULL OR quantity < 1;

-- Verify the change
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'attendee_field_status' 
ORDER BY ordinal_position;
