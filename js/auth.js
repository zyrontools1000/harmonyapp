import { supabase } from './supabaseClient.js';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('login-btn');
const messageEl = document.getElementById('auth-message');
const forgotLink = document.getElementById('forgot-link');

const resetForm = document.getElementById('reset-form');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const resetBtn = document.getElementById('reset-btn');
const resetMessageEl = document.getElementById('reset-message');

let isPasswordRecovery = false;

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = 'auth-message ' + type;
}

function clearMessage() {
  messageEl.textContent = '';
  messageEl.className = 'auth-message';
}

function showResetMessage(text, type) {
  resetMessageEl.textContent = text;
  resetMessageEl.className = 'auth-message ' + type;
}

function showResetForm() {
  isPasswordRecovery = true;
  loginForm.style.display = 'none';
  forgotLink.style.display = 'none';
  resetForm.style.display = 'block';
}

// Supabase fires PASSWORD_RECOVERY when the page loads with a recovery
// token in the URL. This must take priority over the normal "already have
// a session, go to home.html" redirect below — otherwise the recovery
// session silently logs the user in without ever letting them set a new
// password.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    showResetForm();
  } else if (event === 'SIGNED_IN' && !isPasswordRecovery && session) {
    window.location.href = 'home.html';
  }
});

(async function redirectIfLoggedIn() {
  // Give onAuthStateChange a tick to fire PASSWORD_RECOVERY first if the
  // URL contains a recovery token, so we don't race it into home.html.
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (isPasswordRecovery) return;

  const { data } = await supabase.auth.getSession();
  if (data && data.session) {
    window.location.href = 'home.html';
  }
})();

loginForm.addEventListener('submit', async (event) => {
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
    redirectTo: `${window.location.origin}/login.html`,
  });

  if (error) {
    showMessage(error.message, 'error');
  } else {
    showMessage('A password reset link has been sent to your email.', 'success');
  }
});

resetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showResetMessage('', '');

  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (newPassword.length < 6) {
    showResetMessage('Password must be at least 6 characters.', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    showResetMessage('Passwords do not match.', 'error');
    return;
  }

  resetBtn.disabled = true;
  resetBtn.textContent = 'Saving...';

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    showResetMessage(error.message || 'Unable to set new password. Please try again.', 'error');
    resetBtn.disabled = false;
    resetBtn.textContent = 'Set New Password';
    return;
  }

  showResetMessage('Password updated! Entering your sacred space...', 'success');
  window.location.href = 'home.html';
});
