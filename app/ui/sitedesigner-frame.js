// The website designer's preview helper (click-to-edit, pins, selection, scroll). It runs inside the designer's sandboxed
// about:srcdoc frame, loaded by src from the app's origin: an inline script would be blocked by the desktop app's CSP
// (script-src without 'unsafe-inline'), which the srcdoc frame inherits. Talks to sitedesigner.js by postMessage only.
(function(){var post=function(m){m.sd=1;parent.postMessage(m,'*')};
var CM=false;document.addEventListener('click',function(e){var a=e.target.closest('a');if(a)e.preventDefault();var t=e.target;if(t.closest('.wdz-bar'))return;
var pn=t.closest('.wdz-pin');if(pn){e.preventDefault();return post({t:'pinopen',id:pn.dataset.id})}
if(CM){e.preventDefault();e.stopPropagation();var sb=t.closest('[data-block]');if(!sb)return;var r=sb.getBoundingClientRect();return post({t:'pin',block:sb.dataset.block,x:Math.round((e.clientX-r.left)/r.width*100),y:Math.round(e.clientY-r.top),cx:e.clientX,cy:e.clientY})}
var pg=t.closest('[data-page]');if(pg)return post({t:'page',id:pg.dataset.page});
var b=t.closest('[data-btn]');if(b)return post({t:'select',key:b.dataset.btn,kind:'button'});
var im=t.closest('[data-img]');if(im)return post({t:'select',key:im.dataset.img,kind:'image'});
var bl=t.closest('[data-block]');if(bl)post({t:'select',key:bl.dataset.block+'|',kind:'block'})},true);
document.addEventListener('submit',function(e){e.preventDefault()},true);
document.addEventListener('input',function(e){var el=e.target.closest('[data-e]');if(el)post({t:'text',key:el.dataset.e,value:el.innerText})});
document.addEventListener('focusout',function(e){var el=e.target.closest('[data-e]');if(el)post({t:'commit',key:el.dataset.e,value:el.innerText})});
document.addEventListener('keydown',function(e){var el=e.target.closest('[data-e]');if(e.key==='Escape'){if(el)el.blur();else post({t:'esc'});return}if(el&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();el.blur()}if((e.ctrlKey||e.metaKey)&&!el&&/^[zy]$/i.test(e.key)){e.preventDefault();post({t:(e.key.toLowerCase()==='y'||e.shiftKey)?'redo':'undo'})}});
addEventListener('message',function(e){var d=e.data||{};if('cm' in d){CM=!!d.cm;document.documentElement.classList.toggle('wdz-cm',CM)}if(d.pins){[].forEach.call(document.querySelectorAll('.wdz-pin'),function(x){x.remove()});d.pins.forEach(function(p,i){var b=document.querySelector('[data-block="'+p.block+'"]');if(!b)return;var s=document.createElement('button');s.className='wdz-pin'+(p.status!=='open'?' done':'');s.dataset.id=p.id;s.type='button';s.textContent=p.n;s.title=p.text;s.style.left=p.x+'%';s.style.top=Math.min(p.y,b.offsetHeight-12)+'px';b.appendChild(s)})}if('sel' in d){[].forEach.call(document.querySelectorAll('.wdz-sel'),function(x){x.classList.remove('wdz-sel')});if(d.sel){var el=document.querySelector(d.sel);if(el){el.classList.add('wdz-sel');if(d.scroll)el.scrollIntoView({block:'center'})}}}if(d.y!=null)scrollTo(0,d.y)});
addEventListener('scroll',function(){post({t:'scroll',y:scrollY})},{passive:true});var wide='',sw=document.documentElement.scrollWidth,iw=innerWidth;if(sw>iw+1){var bs=document.querySelectorAll('[data-block]');for(var i=0;i<bs.length&&!wide;i++){var els=bs[i].querySelectorAll('*');for(var j=0;j<els.length;j++){if(els[j].getBoundingClientRect().right>iw+1){wide=bs[i].dataset.block;break}}}}
post({t:'ready',sw:sw,iw:iw,wide:wide})})();
// feat/design-site2: work on the page itself. A small bar on the section under the pointer (or the selected one on touch):
// drag the grip to move the section, or use up, down, duplicate, add below, remove. Icons are clickable to swap.
(function(){var post=function(m){m.sd=1;parent.postMessage(m,'*')};
var bar=document.createElement('div');bar.className='wdz-bar';bar.setAttribute('contenteditable','false');
bar.innerHTML='<button type="button" data-a="grip" title="Drag to move this section" aria-label="Drag to move this section">\u22EE\u22EE</button><button type="button" data-a="up" title="Move up" aria-label="Move up">\u2191</button><button type="button" data-a="down" title="Move down" aria-label="Move down">\u2193</button><button type="button" data-a="dup" title="Duplicate" aria-label="Duplicate">\u29C9</button><button type="button" data-a="add" title="Add a section below" aria-label="Add a section below">+</button><button type="button" data-a="del" title="Remove" aria-label="Remove">\u00D7</button>';
var cur=null,drag=null,line=null;
function blocks(){return [].slice.call(document.querySelectorAll('[data-block]'))}
function place(b){if(b===cur)return;cur=b;if(!b){bar.remove();return}b.appendChild(bar)}
document.addEventListener('mouseover',function(e){if(drag)return;var b=e.target.closest&&e.target.closest('[data-block]');if(b)place(b)});
addEventListener('message',function(e){var d=e.data||{};if(d.sel){var el=document.querySelector(d.sel);var b=el&&el.closest('[data-block]');if(b)place(b)}});
bar.addEventListener('click',function(e){var b=e.target.closest('[data-a]');if(!b||!cur)return;e.preventDefault();e.stopPropagation();var a=b.dataset.a;if(a==='grip')return;post({t:'act',act:a,block:cur.dataset.block})});
function gapAt(y){var bs=blocks(),g=bs.length;for(var i=0;i<bs.length;i++){var r=bs[i].getBoundingClientRect();if(y<r.top+r.height/2){g=i;break}}return g}
function lineAt(g){var bs=blocks();if(!line){line=document.createElement('div');line.className='wdz-drop';document.body.appendChild(line)}var y=g<bs.length?bs[g].getBoundingClientRect().top+scrollY:bs[bs.length-1].getBoundingClientRect().bottom+scrollY;line.style.top=(y-2)+'px'}
bar.addEventListener('pointerdown',function(e){var g=e.target.closest('[data-a="grip"]');if(!g||!cur)return;e.preventDefault();drag={id:cur.dataset.block,el:cur,gap:-1};cur.classList.add('wdz-moving');document.documentElement.classList.add('wdz-dragging');try{g.setPointerCapture(e.pointerId)}catch(x){}});
bar.addEventListener('pointermove',function(e){if(!drag)return;var g=gapAt(e.clientY);if(g!==drag.gap){drag.gap=g;lineAt(g)}if(e.clientY<60)scrollBy(0,-18);else if(e.clientY>innerHeight-60)scrollBy(0,18)});
function end(e,ok){if(!drag)return;var d=drag;drag=null;d.el.classList.remove('wdz-moving');document.documentElement.classList.remove('wdz-dragging');if(line){line.remove();line=null}if(!ok||d.gap<0)return;var bs=blocks(),i=bs.indexOf(d.el),to=d.gap>i?d.gap-1:d.gap;if(to!==i)post({t:'move',block:d.id,to:to})}
bar.addEventListener('pointerup',function(e){end(e,true)});bar.addEventListener('pointercancel',function(e){end(e,false)});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&drag)end(e,false)},true);
document.addEventListener('click',function(e){var ic=e.target.closest&&e.target.closest('[data-icon]');if(ic){e.preventDefault();post({t:'icon',key:ic.dataset.icon})}},true);
})()
