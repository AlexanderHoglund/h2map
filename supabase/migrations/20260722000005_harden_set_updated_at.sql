-- Security-linter fix (0011_function_search_path_mutable): pin search_path
-- on the trigger function so a role-level search_path can't redirect
-- unqualified references. The function body only touches NEW, but pinning is
-- cheap and silences the advisor for good.
alter function public.set_updated_at() set search_path = '';
