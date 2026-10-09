-- Prevent accidental exposure through provider HTTP roles, without depending on their existence.
REVOKE ALL ON users,integrations,selected_products,landing_pages,template_settings,leads,webhook_deliveries,rate_limits,schema_migrations FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.users,public.integrations,public.selected_products,public.landing_pages,public.template_settings,public.leads,public.webhook_deliveries,public.rate_limits,public.schema_migrations FROM %I',role_name);
  END LOOP;
END $$;
