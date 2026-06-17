(function () {
  function createStars(selector, count) {
    var container = document.querySelector(selector);
    if (!container) return;
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var star = document.createElement('div');
      star.className = 'star';
      var size = (Math.random() * 1.5 + 0.5).toFixed(2);
      star.style.width = size + 'px';
      star.style.height = size + 'px';
      star.style.top = (Math.random() * 100).toFixed(2) + '%';
      star.style.left = (Math.random() * 100).toFixed(2) + '%';
      // Low opacity — max 0.35
      var minOp = (Math.random() * 0.08 + 0.04).toFixed(2);
      star.style.setProperty('--min-op', minOp);
      // Slow gentle twinkle
      star.style.setProperty('--dur', (Math.random() * 5 + 4).toFixed(2) + 's');
      star.style.animationDuration = 'var(--dur)';
      star.style.animationDelay = (Math.random() * 8).toFixed(2) + 's';
      // 70% white-ish, 30% purple-tinted
      star.style.background = Math.random() > 0.3
        ? 'rgba(255,255,255,0.9)'
        : 'rgba(200,160,255,0.9)';
      fragment.appendChild(star);
    }
    container.appendChild(fragment);
  }
  document.addEventListener('DOMContentLoaded', function () {
    createStars('.stars', 65); // half the previous 140
  });
})();
