-- ============================================================================
-- MIGRATION 09: RLS second wall — uniform tenant policies
-- The 4 main data tables (leads, messages, appointments, properties) already
-- have correct tenant-scoped policies. These 3 sensitive tables had RLS enabled
-- but NO policy (deny-all to logged-in users). Add the same tenant scope so the
-- wall is uniform: a logged-in user can only touch rows for an agent they belong
-- to. The backend (service-role key) bypasses RLS and is unaffected.
-- Idempotent: drops the policy first so re-running is safe.
-- ============================================================================

DROP POLICY IF EXISTS tenant_all_wa_transactions ON wa_transactions;
CREATE POLICY tenant_all_wa_transactions ON wa_transactions
  FOR ALL TO authenticated
  USING (agent_id IN (SELECT agent_id FROM team_members WHERE auth_user_id = auth.uid()))
  WITH CHECK (agent_id IN (SELECT agent_id FROM team_members WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS tenant_all_activity_log ON activity_log;
CREATE POLICY tenant_all_activity_log ON activity_log
  FOR ALL TO authenticated
  USING (agent_id IN (SELECT agent_id FROM team_members WHERE auth_user_id = auth.uid()))
  WITH CHECK (agent_id IN (SELECT agent_id FROM team_members WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS tenant_all_knowledge_gaps ON knowledge_gaps;
CREATE POLICY tenant_all_knowledge_gaps ON knowledge_gaps
  FOR ALL TO authenticated
  USING (agent_id IN (SELECT agent_id FROM team_members WHERE auth_user_id = auth.uid()))
  WITH CHECK (agent_id IN (SELECT agent_id FROM team_members WHERE auth_user_id = auth.uid()));
