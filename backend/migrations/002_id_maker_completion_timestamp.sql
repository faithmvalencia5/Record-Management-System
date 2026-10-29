-- Store the first recorded time an ID Maker queue item reaches Completed.
-- Existing rows are deliberately left NULL because their historical completion
-- time cannot be reconstructed safely from updated_at.
ALTER TABLE public.id_maker_queue
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.id_maker_queue.completed_at IS
  'Timestamp when the queue item first reached Completed; NULL means no reliable completion time is recorded.';
