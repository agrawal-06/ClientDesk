-- Run once on the ClientDesk application branch.
CREATE TABLE IF NOT EXISTS clientdesk_workspaces (
  owner_id text PRIMARY KEY,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  previous_data jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
