-- audit_log must be append-only: no UPDATE, ever, from any DB role — and no
-- DELETE either, EXCEPT from DL-4's scheduled retention job, which needs to
-- purge rows past the retention window. Enforced with a trigger rather than
-- a role-level REVOKE because it holds even if the app's DB role later gets
-- broader grants, and doesn't need to know the app's connection role name.
--
-- The retention job must opt in per-transaction:
--   BEGIN;
--   SET LOCAL audit_log.retention_purge = 'on';
--   DELETE FROM audit_log WHERE created_at < now() - INTERVAL '...';
--   COMMIT;
-- Any UPDATE, or any DELETE without that flag set, is rejected.
CREATE OR REPLACE FUNCTION audit_log_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('audit_log.retention_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted outside the retention job', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_prevent_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_prevent_mutation();
