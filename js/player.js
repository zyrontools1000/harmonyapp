(function () {
  const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  let currentAudio = null;
  let currentItem = null;
  let toastTimer = null;

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function stopCurrent() {
    if (currentAudio) {
      currentAudio.pause();
    }
    if (currentItem) {
      currentItem.classList.remove('playing');
      const btn = currentItem.querySelector('.play-btn');
      if (btn) btn.innerHTML = PLAY_ICON;
    }
    currentAudio = null;
    currentItem = null;
  }

  function formatDuration(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '';
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return mins + ':' + String(secs).padStart(2, '0');
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.audio-item').forEach((item) => {
      const btn = item.querySelector('.play-btn');
      if (!btn) return;

      const src = item.dataset.src || '';
      btn.innerHTML = PLAY_ICON;

      const durationEl = item.querySelector('.audio-duration');
      if (src && durationEl) {
        const probe = new Audio();
        probe.preload = 'metadata';
        probe.addEventListener('loadedmetadata', () => {
          const formatted = formatDuration(probe.duration);
          if (formatted) durationEl.textContent = formatted;
        });
        probe.src = src;
      }

      btn.addEventListener('click', () => {
        if (!src) {
          showToast('This track will be available soon.');
          return;
        }

        if (currentItem === item) {
          if (currentAudio.paused) {
            currentAudio.play();
            item.classList.add('playing');
            btn.innerHTML = PAUSE_ICON;
          } else {
            currentAudio.pause();
            item.classList.remove('playing');
            btn.innerHTML = PLAY_ICON;
          }
          return;
        }

        stopCurrent();

        const audio = new Audio(src);
        audio.addEventListener('ended', stopCurrent);

        audio.play();
        item.classList.add('playing');
        btn.innerHTML = PAUSE_ICON;

        currentAudio = audio;
        currentItem = item;
      });
    });
  });
})();
