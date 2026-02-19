-- Add 'pending_approval' to reservations status check constraint
-- Used when a player requests to join a game that is already 'playing'
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
    CHECK (status IN ('pending', 'waitlisted', 'confirmed', 'cancelled', 'pending_approval'));
