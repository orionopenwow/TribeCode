// Sketch pad, adapted from 50projects50days › drawing-app by Brad Traversy (MIT, see LICENSE).
// TribeCode: pointer events (mouse, pen and touch), canvas scaling, Save PNG, and the brush and colors from config.js.
var C = window.CONFIG || {};
var canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
var sizeEL = document.getElementById('size'), colorEl = document.getElementById('color');
var size = C.brush || 10, isPressed = false, x, y;
colorEl.value = C.ink2 || '#12151A';
var color = colorEl.value;
sizeEL.innerText = size;
function at(e) { var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; }
canvas.addEventListener('pointerdown', function (e) { isPressed = true; var p = at(e); x = p[0]; y = p[1]; drawCircle(x, y); canvas.setPointerCapture(e.pointerId); });
document.addEventListener('pointerup', function () { isPressed = false; x = y = undefined; });
canvas.addEventListener('pointermove', function (e) { if (!isPressed) return; var p = at(e); drawCircle(p[0], p[1]); drawLine(x, y, p[0], p[1]); x = p[0]; y = p[1]; });
function drawCircle(x, y) { ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
function drawLine(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = size * 2; ctx.stroke(); }
document.getElementById('increase').addEventListener('click', function () { size = Math.min(50, size + 5); sizeEL.innerText = size; });
document.getElementById('decrease').addEventListener('click', function () { size = Math.max(5, size - 5); sizeEL.innerText = size; });
colorEl.addEventListener('change', function (e) { color = e.target.value; });
document.getElementById('clear').addEventListener('click', function () { ctx.clearRect(0, 0, canvas.width, canvas.height); });
document.getElementById('save').addEventListener('click', function () { var a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = (C.fileName || 'sketch') + '.png'; a.click(); });
