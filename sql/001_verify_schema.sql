-- Isolated verify slice. Never ALTER or DROP public objects.
CREATE SCHEMA IF NOT EXISTS verify;

CREATE TABLE IF NOT EXISTS verify.volunteers (
  id text PRIMARY KEY,
  name text NOT NULL,
  offer text NOT NULL,
  zone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  field_city text,
  field_role text,
  digital_skills jsonb,
  crisis_experience boolean,
  source text,
  code text NOT NULL,
  created_at bigint NOT NULL,
  document_type text NOT NULL DEFAULT 'CC',
  document_number text,
  linkedin_url text,
  CONSTRAINT volunteers_code_unique UNIQUE (code),
  CONSTRAINT volunteers_document_number_unique UNIQUE (document_number)
);

CREATE TABLE IF NOT EXISTS verify.verification_requests (
  id text PRIMARY KEY,
  volunteer_id text NOT NULL REFERENCES verify.volunteers (id),
  document_type text NOT NULL DEFAULT 'CC',
  created_at bigint NOT NULL,
  status text NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS verify.verification_reports (
  id text PRIMARY KEY,
  volunteer_id text NOT NULL REFERENCES verify.volunteers (id),
  overall_status text NOT NULL,
  checks jsonb NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS verification_reports_volunteer_id_idx
  ON verify.verification_reports (volunteer_id);

INSERT INTO verify.volunteers (
  id,
  name,
  offer,
  zone,
  status,
  source,
  code,
  created_at,
  document_type,
  document_number
) VALUES (
  'verify-operator-001',
  'Example Operator',
  'verification-operator',
  'internal',
  'pending',
  'seed',
  'VERIFY-OP-001',
  1755382800000,
  'CC',
  '1000000000'
)
ON CONFLICT (document_number) DO NOTHING;
