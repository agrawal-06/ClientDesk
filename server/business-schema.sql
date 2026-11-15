CREATE TABLE IF NOT EXISTS clientdesk_portal_links (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES clientdesk_workspaces(owner_id),
 client_id text NOT NULL, token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL,
 revoked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clientdesk_portal_owner ON clientdesk_portal_links(owner_id);
-- ponytail: small attachments in Postgres, 1 MB each and 20 MB per workspace.
-- Move bytes to object storage when these product limits need to increase.
CREATE TABLE IF NOT EXISTS clientdesk_files (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES clientdesk_workspaces(owner_id),
 project_id text NOT NULL, name text NOT NULL, content bytea NOT NULL,
 shared boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (octet_length(content) BETWEEN 1 AND 1048576)
);
CREATE INDEX IF NOT EXISTS clientdesk_files_owner ON clientdesk_files(owner_id);
CREATE TABLE IF NOT EXISTS clientdesk_orders (
 order_id text PRIMARY KEY, owner_id text NOT NULL REFERENCES clientdesk_workspaces(owner_id),
 invoice_id text NOT NULL, amount bigint NOT NULL CHECK(amount > 0),
 payment_id text UNIQUE, captured_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id, invoice_id)
);
