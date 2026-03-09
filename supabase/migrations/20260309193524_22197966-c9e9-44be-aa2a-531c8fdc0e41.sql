
-- Fix ALL RLS policies to be PERMISSIVE instead of RESTRICTIVE
-- Without permissive policies, PostgreSQL denies ALL access by default

-- ===================== PROJECTS =====================
DROP POLICY IF EXISTS "Anyone can read published projects" ON public.projects;
DROP POLICY IF EXISTS "Users can read own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

CREATE POLICY "Anyone can read published projects" ON public.projects FOR SELECT TO anon, authenticated USING (is_published = true);
CREATE POLICY "Users can read own projects" ON public.projects FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ===================== PROFILES =====================
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ===================== PROJECT_DATA =====================
DROP POLICY IF EXISTS "Anon can read published project_data" ON public.project_data;
DROP POLICY IF EXISTS "Owners manage own project_data" ON public.project_data;
DROP POLICY IF EXISTS "Service role full access on project_data" ON public.project_data;

CREATE POLICY "Anon can read published project_data" ON public.project_data FOR SELECT TO anon, authenticated USING (project_id IN (SELECT id FROM projects WHERE is_published = true));
CREATE POLICY "Owners manage own project_data" ON public.project_data FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "Service role full access on project_data" ON public.project_data FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===================== PROJECT_USERS =====================
DROP POLICY IF EXISTS "Service role full access on project_users" ON public.project_users;

CREATE POLICY "Service role full access on project_users" ON public.project_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===================== PROJECT_FUNCTIONS =====================
DROP POLICY IF EXISTS "Owners manage project_functions" ON public.project_functions;

CREATE POLICY "Owners manage project_functions" ON public.project_functions FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== PROJECT_SCHEMAS =====================
DROP POLICY IF EXISTS "Owners manage project_schemas" ON public.project_schemas;

CREATE POLICY "Owners manage project_schemas" ON public.project_schemas FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== PROJECT_ENVIRONMENTS =====================
DROP POLICY IF EXISTS "Owners manage project_environments" ON public.project_environments;

CREATE POLICY "Owners manage project_environments" ON public.project_environments FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== PROJECT_ANALYTICS =====================
DROP POLICY IF EXISTS "Anyone can insert analytics" ON public.project_analytics;
DROP POLICY IF EXISTS "Owners can read analytics" ON public.project_analytics;

CREATE POLICY "Anyone can insert analytics" ON public.project_analytics FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Owners can read analytics" ON public.project_analytics FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== PROJECT_DECISIONS =====================
DROP POLICY IF EXISTS "Owners manage project_decisions" ON public.project_decisions;

CREATE POLICY "Owners manage project_decisions" ON public.project_decisions FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== PROJECT_DEPENDENCIES =====================
DROP POLICY IF EXISTS "Owners manage project_dependencies" ON public.project_dependencies;

CREATE POLICY "Owners manage project_dependencies" ON public.project_dependencies FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== PROJECT_KNOWLEDGE =====================
DROP POLICY IF EXISTS "Owners manage project_knowledge" ON public.project_knowledge;

CREATE POLICY "Owners manage project_knowledge" ON public.project_knowledge FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== PROJECT_GOVERNANCE_RULES =====================
DROP POLICY IF EXISTS "Owners manage project_governance_rules" ON public.project_governance_rules;

CREATE POLICY "Owners manage project_governance_rules" ON public.project_governance_rules FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== DEPLOY_HISTORY =====================
DROP POLICY IF EXISTS "Owners insert deploy_history" ON public.deploy_history;
DROP POLICY IF EXISTS "Owners read deploy_history" ON public.deploy_history;

CREATE POLICY "Owners insert deploy_history" ON public.deploy_history FOR INSERT TO authenticated WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "Owners read deploy_history" ON public.deploy_history FOR SELECT TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== INSTALLED_PLUGINS =====================
DROP POLICY IF EXISTS "Owners manage installed plugins" ON public.installed_plugins;

CREATE POLICY "Owners manage installed plugins" ON public.installed_plugins FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ===================== PLUGINS =====================
DROP POLICY IF EXISTS "Anyone can read plugins" ON public.plugins;

CREATE POLICY "Anyone can read plugins" ON public.plugins FOR SELECT TO anon, authenticated USING (true);

-- ===================== TEAM_MESSAGES =====================
DROP POLICY IF EXISTS "Project members can read team messages" ON public.team_messages;
DROP POLICY IF EXISTS "Project members can send team messages" ON public.team_messages;

CREATE POLICY "Project members can read team messages" ON public.team_messages FOR SELECT TO authenticated USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  OR project_id IN (SELECT project_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'accepted')
);
CREATE POLICY "Project members can send team messages" ON public.team_messages FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
    OR project_id IN (SELECT project_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'accepted')
  )
);

-- ===================== WORKSPACE_MEMBERS =====================
DROP POLICY IF EXISTS "Owners manage workspace_members" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can accept/decline invites" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can see own invites" ON public.workspace_members;

CREATE POLICY "Owners manage workspace_members" ON public.workspace_members FOR ALL TO authenticated USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())) WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "Users can see own invites" ON public.workspace_members FOR SELECT TO authenticated USING (email = (SELECT email FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can accept/decline invites" ON public.workspace_members FOR UPDATE TO authenticated USING (email = (SELECT email FROM profiles WHERE id = auth.uid())) WITH CHECK (email = (SELECT email FROM profiles WHERE id = auth.uid()));
