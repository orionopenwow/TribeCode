// Optional quick tour: Help (?) → Take a quick tour, or Settings.
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore;
  const STEPS = [
    { el: '#tour-rail', title: 'Your projects', body: 'Each circle is a project room with its own people, chat, files and tasks. The orange bar marks where you are; + starts a new one or joins a friend.', place: 'right' },
    { el: '#tour-side', title: 'Everything in this project', body: 'Dashboard, Messages, Files, Task Board and Agents Hub. + Add brings more (Calendar, Bugs…); Ctrl K finds the rest.', place: 'right' },
    { el: '#tour-search', title: 'Jump anywhere with Ctrl K', body: 'Search docs, tasks, people and actions from the keyboard.', place: 'below' },
    { el: '#tour-room', title: 'Who\'s here', body: 'People and agents in this project and what they are doing. Opening a doc or screenshot previews it here.', place: 'left' },
    { el: '#tour-invite', title: 'Bring your friends', body: 'One click makes an invite link. Friends pick a name and they\'re in.', place: 'right' },
  ];
  let i = 0, active = false;

  function position() {
    if (!active) return;
    const s = STEPS[i], target = $(s.el), spot = $('#tour-spot'), tip = $('#tour-tip');
    if (!target) return;
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 16, vw = innerWidth, vh = innerHeight;
    let x, y;
    if (s.place === 'right') { x = r.right + gap; y = r.top + Math.min(40, r.height / 2 - th / 2); }
    else if (s.place === 'left') { x = r.left - tw - gap; y = r.top; }
    else if (s.place === 'below') { x = r.left + r.width / 2 - tw / 2; y = r.bottom + gap; }
    else { x = r.right - tw; y = r.top - th - gap; }
    tip.style.left = Math.max(12, Math.min(vw - tw - 12, x)) + 'px';
    tip.style.top = Math.max(12, Math.min(vh - th - 12, y)) + 'px';
  }

  function render() {
    const s = STEPS[i], last = i === STEPS.length - 1;
    $('#tour-tip').innerHTML = `
      <div class="step">STEP ${i + 1} OF ${STEPS.length}</div>
      <h4>${s.title}</h4><p>${s.body}</p>
      <div class="row">
        <div class="dots">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="spacer"></div>
        ${last ? '' : '<button class="btn ghost" data-t="skip">Skip</button>'}
        ${i > 0 ? '<button class="btn" data-t="back">Back</button>' : ''}
        <button class="btn primary" data-t="next">${last ? 'Finish' : 'Next'}</button>
      </div>`;
    $('#tour-tip').querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => act(b.dataset.t)));
    requestAnimationFrame(position);
    $('#tour-tip').querySelector('.btn.primary').focus();
  }

  function act(a) {
    if (a === 'next') { if (i === STEPS.length - 1) return end(true); i++; render(); }
    else if (a === 'back') { i = Math.max(0, i - 1); render(); }
    else end(false);
  }

  function start(at = 0) { i = at; active = true; $('#tour').classList.remove('hidden'); render(); }
  function end(completed) {
    active = false; $('#tour').classList.add('hidden');
    if (completed) { S.set({ tour: { done: true }, checklist: { tour: true } }); window.TribeApp.refresh(); window.TribeApp.toast('Tour complete. Have fun building!'); }
  }

  addEventListener('resize', position);
  document.addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Escape') end(false);
    else if (e.key === 'ArrowRight') act('next');
    else if (e.key === 'ArrowLeft') act('back');
  });
  window.TribeTour = { start, end, isActive: () => active };
})();
