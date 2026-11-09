/**
 * Settings can change during the active session (design 07, from the next day on), so
 * `settings_json` is no longer immutable. Closed sessions still never change, and the other
 * identifying fields stay fixed.
 */
import type { Migration } from './types';

export const migration002: Migration = {
  version: 2,
  name: 'session_settings',
  sql: `
DROP TRIGGER sessions_closed_frozen;
CREATE TRIGGER sessions_closed_frozen BEFORE UPDATE ON sessions
WHEN OLD.status = 'closed'
  OR NEW.id IS NOT OLD.id
  OR NEW.starting_budget_cents IS NOT OLD.starting_budget_cents
  OR NEW.started_at IS NOT OLD.started_at
BEGIN
  SELECT RAISE(ABORT, 'session is closed or field is immutable');
END;
`,
};
