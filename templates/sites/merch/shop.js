/* shop.js: product details and the cart for this merch page. Products come from site.json › products.
   The cart lives in this browser (localStorage). Payment happens on YOUR checkout page: set site.json › checkout › url
   to a Stripe Payment Link, a Shopify or Gumroad checkout, or similar. This page never takes card details itself. */
(function () {
  'use strict';
  var data = (window.SiteData && SiteData.get()) || {};
  var KEY = 'shop-cart:' + location.pathname;
  var cart = []; try { cart = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { cart = []; }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var money = function (n) { return (data.currency || '$') + (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0); };
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // product details
  var pd = $('#pd'), current = null;
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-product]'); if (!b) return;
    var p = (data.products || [])[Number(b.getAttribute('data-product')) - 1]; if (!p) return;
    current = p;
    $('.pd-img', pd).src = p.img; $('.pd-img', pd).alt = p.name;
    $('#pd-name').textContent = p.name; $('.pd-price', pd).textContent = money(Number(p.price) || 0);
    $('.pd-desc', pd).textContent = p.desc || p.note || '';
    var sizes = String(p.sizes || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    $('.pd-sizes', pd).hidden = !sizes.length;
    $('.sz', pd).innerHTML = sizes.map(function (s, i) { return '<label><input type="radio" name="size" value="' + esc(s) + '"' + (i === 1 || sizes.length === 1 ? ' checked' : '') + '><span>' + esc(s) + '</span></label>'; }).join('');
    if (pd.showModal) pd.showModal(); else pd.setAttribute('open', '');
  });
  $('.add', pd).addEventListener('click', function () {
    if (!current) return;
    var size = ($('input[name=size]:checked', pd) || {}).value || '';
    var line = cart.find(function (l) { return l.name === current.name && l.size === size; });
    if (line) line.qty++; else cart.push({ name: current.name, price: Number(current.price) || 0, img: current.img, size: size, qty: 1 });
    save(); draw(); pd.close(); openCart(true);
  });

  // the cart
  var box = $('#cart'), btn = $('.cart-btn');
  function openCart(on) { box.hidden = !on; btn.setAttribute('aria-expanded', String(!!on)); if (on) $('.cart-x').focus(); else btn.focus(); }
  btn.addEventListener('click', function () { openCart(box.hidden); });
  $('.cart-x').addEventListener('click', function () { openCart(false); });
  box.addEventListener('click', function (e) { if (e.target === box) openCart(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) openCart(false); });
  $('.lines').addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]'); if (!b) return;
    var l = cart[Number(b.getAttribute('data-i'))]; if (!l) return;
    l.qty += Number(b.getAttribute('data-q')); if (l.qty < 1) cart.splice(cart.indexOf(l), 1);
    save(); draw();
  });
  function draw() {
    var n = cart.reduce(function (a, l) { return a + l.qty; }, 0), sub = cart.reduce(function (a, l) { return a + l.qty * l.price; }, 0);
    $('.cart-n').textContent = n;
    $('.lines').innerHTML = cart.map(function (l, i) {
      return '<li><img src="' + esc(l.img) + '" alt=""><div><b>' + esc(l.name) + '</b><small>' + (l.size ? 'Size ' + esc(l.size) + ' · ' : '') + money(l.price) + '</small></div>' +
        '<div class="qty"><button type="button" data-q="-1" data-i="' + i + '" aria-label="One less">−</button><span>' + l.qty + '</span><button type="button" data-q="1" data-i="' + i + '" aria-label="One more">+</button></div></li>';
    }).join('');
    $('.empty').hidden = !!cart.length;
    $('.sub b').textContent = money(sub);
    var ck = $('.checkout'), url = (data.checkout || {}).url;
    ck.setAttribute('aria-disabled', String(!cart.length || !url));
    if (!url) ck.removeAttribute('href');
  }
  document.addEventListener('site:data', function (e) { data = e.detail || data; draw(); });
  draw();
})();
