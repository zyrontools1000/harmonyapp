import { supabase } from './supabaseClient.js';

(async function () {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data || !data.session) {
    window.location.href = 'index.html';
  }
})();

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    window.location.href = 'index.html';
  }
});
