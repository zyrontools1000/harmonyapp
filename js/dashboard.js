import { supabase } from './supabaseClient.js';

const THOUGHTS = [
  'Stillness is the doorway through which the soul remembers its true frequency.',
  'Every vibration you choose to carry today shapes the temple within.',
  'Healing is not a destination — it is a frequency you return to, again and again.',
  'When the heart is tuned to gratitude, the whole body becomes an instrument of light.',
  'Peace is not the absence of noise, but the presence of harmony within.',
  'You are not separate from the divine frequency — you are made of it.',
  'Let today be a quiet act of devotion: breathe, listen, and align.',
  'The frequency of love dissolves what fear has built.',
  'In silence, the sacred speaks the loudest.',
  'Your body is a sanctuary — fill it with sound that heals.',
];

const thoughtEl = document.getElementById('thought-text');
const logoutBtn = document.getElementById('logout-btn');

function setThoughtOfTheDay() {
  if (!thoughtEl) return;
  const dayIndex = Math.floor(Date.now() / 86400000) % THOUGHTS.length;
  thoughtEl.textContent = THOUGHTS[dayIndex];
}

async function init() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data || !data.session) {
    window.location.href = 'login.html';
    return;
  }

  setThoughtOfTheDay();
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    window.location.href = 'login.html';
  }
});

init();
