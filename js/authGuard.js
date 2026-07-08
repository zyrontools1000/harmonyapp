import { supabase } from './supabaseClient.js';

(async function () {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data || !data.session) {
    window.location.href = 'login.html';
    return;
  }

  const email = data.session.user?.email;
  if (!email) {
    window.location.href = 'login.html';
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('email', email)
    .maybeSingle();

  if (profileError || !profile || profile.subscription_status !== 'active') {
    window.location.href = 'https://harmonyapp.app';
  }
})();

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    window.location.href = 'login.html';
  }
});
