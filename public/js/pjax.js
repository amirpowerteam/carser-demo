// Simple PJAX navigation: intercept internal links, fetch the target page,
// replace the main content and execute scripts so audio/player state persists.
(function(){
  function isInternalLink(a){
    if(!a || !a.href) return false;
    if(a.target && a.target !== '' && a.target !== '_self') return false;
    const url = new URL(a.href, location.href);
    return url.origin === location.origin && url.pathname !== location.pathname + url.search;
  }

  async function navigate(href, replaceState){
    try{
      const res = await fetch(href, {credentials:'same-origin'});
      if(!res.ok) return (location.href = href);
      const txt = await res.text();
      const doc = new DOMParser().parseFromString(txt, 'text/html');
      const newMain = doc.querySelector('main') || doc.querySelector('#content') || doc.querySelector('.container');
      const curMain = document.querySelector('main') || document.querySelector('#content') || document.querySelector('.container');
      if(!newMain || !curMain) { location.href = href; return; }
      // replace
      curMain.innerHTML = newMain.innerHTML;
      // update title
      if(doc.title) document.title = doc.title;
      // run scripts found inside newMain
      const scripts = Array.from(newMain.querySelectorAll('script'));
      for(const s of scripts){
        if(s.src){
          // load external script
          await loadScript(s.src);
        } else if(s.textContent){
          try{ new Function(s.textContent)(); }catch(e){ console.error('pjax eval error', e); }
        }
      }
      // push state
      if(replaceState) history.replaceState({}, '', href); else history.pushState({}, '', href);
      window.scrollTo(0,0);
      // update active nav links
      updateActiveLinks();
    }catch(e){ console.error('pjax navigate failed', e); location.href = href; }
  }

  function loadScript(src){
    return new Promise((resolve, reject)=>{
      // avoid re-loading same src
      if(document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script'); s.src = src; s.async = false; s.onload = resolve; s.onerror = reject; document.body.appendChild(s);
    });
  }

  function updateActiveLinks(){
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(a=>{
      try{
        const u = new URL(a.href, location.href);
        if(u.pathname === location.pathname) a.classList.add('active'); else a.classList.remove('active');
      }catch(e){}
    });
  }

  document.addEventListener('click', (ev)=>{
    const a = ev.target.closest && ev.target.closest('a');
    if(!a) return;
    if(a.hasAttribute('data-no-pjax')) return;
    // allow hash links
    if(a.hash && a.pathname === location.pathname) return;
    if(!isInternalLink(a)) return;
    ev.preventDefault();
    navigate(a.href, false);
  });

  window.addEventListener('popstate', ()=>{
    navigate(location.href, true);
  });

  // on load, mark active
  document.addEventListener('DOMContentLoaded', ()=>{ updateActiveLinks(); });

})();
