// The website designer's preview helper (click-to-edit, pins, selection, scroll). It runs inside the designer's sandboxed
// about:srcdoc frame, loaded by src from the app's origin: an inline script would be blocked by the desktop app's CSP
// (script-src without 'unsafe-inline'), which the srcdoc frame inherits. Talks to sitedesigner.js by postMessage only.
(function(){var post=function(m){m.sd=1;parent.postMessage(m,'*')};
var CM=false;document.addEventListener('click',function(e){var a=e.target.closest('a');if(a)e.preventDefault();var t=e.target;
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
addEventListener('scroll',function(){post({t:'scroll',y:scrollY})},{passive:true});post({t:'ready'})})()
