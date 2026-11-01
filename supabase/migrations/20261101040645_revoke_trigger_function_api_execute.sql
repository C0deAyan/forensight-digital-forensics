/*
# Revoke API execution of the custody chain trigger function

1. Modified Functions
- `custody_events_chain_trigger()` is a trigger function. It was callable as an RPC by the anon and authenticated roles.

2. Security
- Revokes EXECUTE from PUBLIC, anon and authenticated.
- The trigger keeps firing on inserts into custody_events; PostgreSQL does not check EXECUTE privilege when a trigger fires.

3. Notes
- Idempotent: REVOKE on an already-revoked privilege is a no-op.
*/

REVOKE EXECUTE ON FUNCTION public.custody_events_chain_trigger() FROM PUBLIC, anon, authenticated;
