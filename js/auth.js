import { supabase } from './supabaseClient.js';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('login-btn');
const messageEl = document.getElementById('auth-message');
const forgotLink = document.getElementById('forgot-link');

const resetForm = document.getElementById('reset-form');
const codeGroup = document.getElementById('code-group');
const codeInput = document.getElementById('reset-code');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const resetBtn = document.getElementById('reset-btn');
const resetMessageEl = document.getElementById('reset-message');

let isPasswordRecovery = false;
// True only once a recovery session already exists (e.g. a reset link that
// actually worked). In that case the code field isn't needed. Reset-link
// tokens get consumed by email link-scanners before the user ever clicks
// them, so the code — typed in by hand — is the flow we actually rely on.
let hasRecoverySession = false;

// Supabase reports an expired/invalid recovery or magic link as
// #error=...&error_code=...&error_description=... on this same page,
// rather than firing PASSWORD_RECOVERY. Surface that instead of silently
// falling through to "already logged in, go to home.html" below, which
// would hide the failure from anyone who happens to have another valid
// session in the same browser.
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const hashError = hashParams.get('error_description') || hashParams.get('error');
const recoveryLinkFailed = Boolean(hashError);
if (recoveryLinkFailed) {
  showMessage(
    `${hashError.replace(/\+/g, ' ')} Please request a new reset link.`,
    'error',
  );
}

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
  codeGroup.style.display = hasRecoverySession ? 'none' : 'block';
  codeInput.required = !hasRecoverySession;
}

// Supabase fires PASSWORD_RECOVERY when the page loads with a recovery
// token in the URL. This must take priority over the normal "already have
// a session, go to home.html" redirect below — otherwise the recovery
// session silently logs the user in without ever letting them set a new
// password.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    hasRecoverySession = true;
    showResetForm();
  } else if (event === 'SIGNED_IN' && !isPasswordRecovery && !recoveryLinkFailed && session) {
    window.location.href = 'home.html';
  }
});

(async function redirectIfLoggedIn() {
  // Give onAuthStateChange a tick to fire PASSWORD_RECOVERY first if the
  // URL contains a recovery token, so we don't race it into home.html.
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (isPasswordRecovery || recoveryLinkFailed) return;

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
    return;
  }

  showResetForm();
  showResetMessage('Check your email for a code.', 'success');
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

  if (!hasRecoverySession) {
    const code = codeInput.value.trim();
    if (!code) {
      showResetMessage('Enter the code from your email.', 'error');
      resetBtn.disabled = false;
      resetBtn.textContent = 'Set New Password';
      return;
    }

    const { error: otpError } = await supabase.auth.verifyOtp({
      email: emailInput.value.trim(),
      token: code,
      type: 'recovery',
    });

    if (otpError) {
      showResetMessage(otpError.message || 'Invalid or expired code. Please request a new one.', 'error');
      resetBtn.disabled = false;
      resetBtn.textContent = 'Set New Password';
      return;
    }

    hasRecoverySession = true;
  }

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
