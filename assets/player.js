/* Minimal audio player for poem recordings.
   Native <audio controls> is a black rectangle that fights the poem for attention,
   so the markup is a button + hairline track styled in the site's own palette. */
(function () {
  const fmt = t => {
    if (!isFinite(t)) return '0:00';
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  };

  document.querySelectorAll('.player').forEach(player => {
    const audio = player.querySelector('audio');
    const btn   = player.querySelector('.player-btn');
    const track = player.querySelector('.player-track');
    const fill  = player.querySelector('.player-fill');
    const time  = player.querySelector('.player-time');
    if (!audio || !btn) return;

    const paint = () => {
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      fill.style.width = pct + '%';
      track.setAttribute('aria-valuenow', Math.round(pct));
      time.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
    };

    const setPlaying = on => {
      player.classList.toggle('playing', on);
      btn.setAttribute('aria-label', on ? 'Pause reading' : 'Play reading');
    };

    btn.addEventListener('click', () => {
      if (audio.paused) {
        // only one recording plays at a time
        document.querySelectorAll('.player audio').forEach(a => { if (a !== audio) a.pause(); });
        audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play',  () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => { setPlaying(false); audio.currentTime = 0; paint(); });
    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('loadedmetadata', paint);
    audio.addEventListener('error', () => {
      player.style.display = 'none';   // a missing file should not leave a dead control
    });

    const seek = clientX => {
      if (!audio.duration) return;
      const r = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      audio.currentTime = ratio * audio.duration;
      paint();
    };

    track.addEventListener('pointerdown', e => {
      seek(e.clientX);
      const move = ev => seek(ev.clientX);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { audio.currentTime = Math.max(0, audio.currentTime - 5); e.preventDefault(); }
      if (e.key === ' ' || e.key === 'Enter') { btn.click(); e.preventDefault(); }
    });

    paint();
  });
})();
