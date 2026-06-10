import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://qysvehczobxyqysrsvvh.supabase.co';

export const SUPABASE_ANON_KEY = 'sb_publishable_zCU584lGy8K8Q9HombOtaw_bstIszAz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
