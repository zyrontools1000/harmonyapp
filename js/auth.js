import { supabase } from './supabaseClient.js';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('login-btn');
const messageEl = document.getElementById('auth-message');
const forgotLink = document.getElementById('forgot-link');

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = 'auth-message ' + type;
}

function clearMessage() {
  messageEl.textContent = '';
  messageEl.className = 'auth-message';
}

(async function redirectIfLoggedIn() {
  const { data } = await supabase.auth.getSession();
  if (data && data.session) {
    window.location.href = 'home.html';
  }
})();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage('Please enter your email and password.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Entering...';

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showMessage(error.message || 'Unable to sign in. Please check your credentials.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Access My Space';
    return;
  }

  showMessage('Welcome back. Entering your sacred space...', 'success');
  window.location.href = 'home.html';
});

forgotLink.addEventListener('click', async (event) => {
  event.preventDefault();
  clearMessage();

  const email = emailInput.value.trim();
  if (!email) {
    showMessage('Enter your email above, then click "Forgot password?" again.', 'error');
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.replace('index.html', 'index.html'),
  });

  if (error) {
    showMessage(error.message, 'error');
  } else {
    showMessage('A password reset link has been sent to your email.', 'success');
  }
});
