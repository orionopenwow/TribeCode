// Name tags over every patron's head, always marked BOT, and their speech bubbles. HTML laid over the 3D view.
import * as THREE from 'three';

const v = new THREE.Vector3();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createLabels(layer, patrons) {
  const els = new Map();
  for (const p of patrons) {
    const el = document.createElement('div');
    el.className = 'label'; el.dataset.patron = p.id;
    el.innerHTML = `<span class="bubble" hidden></span><span class="tag"><span class="bot">BOT</span>${esc(p.name)} · ${esc(p.role)}</span>`;
    layer.appendChild(el); els.set(p, el);
  }
  return {
    update(camera, width, height) {
      for (const [p, el] of els) {
        v.set(p.x, p.y + (p.sitting ? 1.45 : 1.75), p.z).project(camera);
        const dist = camera.position.distanceTo(new THREE.Vector3(p.x, 1.6, p.z));
        const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && dist < 14;
        el.style.display = visible ? '' : 'none';
        if (!visible) continue;
        el.style.left = `${(v.x * 0.5 + 0.5) * width}px`; el.style.top = `${(-v.y * 0.5 + 0.5) * height}px`;
        el.style.opacity = String(Math.max(0.35, 1 - dist / 16));
        const b = el.firstChild, text = p.bubble ? p.bubble.text : '';
        if (b.textContent !== text) b.textContent = text;
        b.hidden = !text;
      }
    },
  };
}
