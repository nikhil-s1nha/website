/* Thoughts / Poetry tab switcher. Keeps #poetry in the URL so a poem's
   back-link can return the reader to the tab they came from. */
(function () {
  const tabs = document.querySelectorAll('.page-title[data-tab]');
  const panels = { thoughts: 'panel-thoughts', poetry: 'panel-poetry' };
  const legend = { thoughts: 'legend-thoughts', poetry: 'legend-poetry' };
  const medium = { thoughts: 'medium-thoughts', poetry: 'medium-poetry' };
  const $ = id => document.getElementById(id);

  let current = 'thoughts';

  const paintChrome = target => {
    tabs.forEach(t => {
      t.classList.toggle('active',   t.dataset.tab === target);
      t.classList.toggle('inactive', t.dataset.tab !== target);
      t.setAttribute('aria-selected', String(t.dataset.tab === target));
    });
    for (const key of Object.keys(panels)) {
      $(legend[key]).classList.toggle('hidden', key !== target);
      $(medium[key]).classList.toggle('hidden', key !== target);
    }
  };

  // land directly on the poetry tab when the URL asks for it
  if (window.location.hash === '#poetry') {
    current = 'poetry';
    paintChrome('poetry');
    $(panels.thoughts).style.display = 'none';
    $(panels.poetry).style.display = 'block';
  } else {
    paintChrome('thoughts');
  }

  const show = target => {
    if (target === current) return;
    const outPanel = $(panels[current]);
    const inPanel  = $(panels[target]);

    paintChrome(target);
    history.replaceState(null, '', target === 'poetry' ? '#poetry' : window.location.pathname);

    outPanel.classList.add('exiting');
    outPanel.addEventListener('animationend', () => {
      outPanel.style.display = 'none';
      outPanel.classList.remove('exiting');

      // replay the stagger on the incoming list
      inPanel.querySelectorAll('.post-item').forEach(item => {
        item.style.animation = 'none';
        void item.offsetHeight;
        item.style.animation = '';
      });

      inPanel.style.display = 'block';
      inPanel.classList.add('entering');
      inPanel.addEventListener('animationend',
        () => inPanel.classList.remove('entering'), { once: true });

      current = target;
    }, { once: true });
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => show(tab.dataset.tab));
    tab.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { show(tab.dataset.tab); e.preventDefault(); }
    });
  });
})();
