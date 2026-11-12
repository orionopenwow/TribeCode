// The one support contact for TribeCode's public pages (support.html, delete-account.html, privacy.html) and the app.
// Change it here. Elements with [data-support-email] show it; [data-support-mailto] links get mailto: with an optional
// data-subject. A placeholder until the project has a real inbox (docs/APP-STORE.md).
(function () {
  'use strict';
  const SUPPORT_EMAIL = 'support@tribecode.org';
  const mailto = (subject, body) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject || 'TribeCode')}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
  function fill(root) {
    (root || document).querySelectorAll('[data-support-email]').forEach(el => { el.textContent = SUPPORT_EMAIL; });
    (root || document).querySelectorAll('[data-support-mailto]').forEach(a => { a.href = mailto(a.dataset.subject); });
  }
  window.TribeSupport = { SUPPORT_EMAIL, mailto, fill };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fill()); else fill();
})();
