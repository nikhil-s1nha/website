/* Thoughts / Poetry tab switcher. Keeps #poetry in the URL so a poem's
   back-link can return the reader to the tab they came from. */
(function () {
  const tabs = document.querySelectorAll('.page-title[data-tab]');
  const panels = { thoughts: 'panel-thoughts', poetry: 'panel-poetry' };
  const medium = { thoughts: 'medium-thoughts', poetry: 'medium-poetry' };
  const $ = id => document.getElementById(id);

  const rule = document.querySelector('.tab-rule');
  const mark = document.querySelector('.tab-rule-mark');

  let current = 'thoughts';

  // park the mark under the live tab; measured rather than guessed so it
  // stays aligned across font loading, resizes and zoom
  const placeMark = target => {
    if (!rule || !mark) return;
    const tab = [...tabs].find(t => t.dataset.tab === target);
    if (!tab) return;
    const base = rule.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    mark.style.left = (box.left - base.left) + 'px';
    mark.style.width = box.width + 'px';
  };

  const paintChrome = target => {
    tabs.forEach(t => {
      t.classList.toggle('active',   t.dataset.tab === target);
      t.classList.toggle('inactive', t.dataset.tab !== target);
      t.setAttribute('aria-selected', String(t.dataset.tab === target));
    });
    for (const key of Object.keys(panels)) {
      $(medium[key]).classList.toggle('hidden', key !== target);
    }
    placeMark(target);
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

  // the mark is measured, so re-measure whenever the metrics can change
  window.addEventListener('resize', () => placeMark(current));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeMark(current));

  tabs.forEach(tab => {
    tab.addEventListener('click', () => show(tab.dataset.tab));
    tab.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { show(tab.dataset.tab); e.preventDefault(); }
    });
  });
})();
