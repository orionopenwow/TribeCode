// The contact form shows a thank-you. Connect it to a real inbox later (a form service or your own server).
document.getElementById('contact-form').addEventListener('submit', e => {
  e.preventDefault();
  e.target.querySelectorAll('input, textarea').forEach(i => { i.value = ''; });
  document.getElementById('sent').hidden = false;
});
