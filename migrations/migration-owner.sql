ALTER TABLE spots ADD COLUMN owner_token TEXT;
CREATE INDEX IF NOT EXISTS idx_spots_owner_token ON spots(owner_token);