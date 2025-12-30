// Minimal singleton audio player exposed as window.KJAudio
(function(){
  if (typeof window === 'undefined') return;

  // Instrument: record every Audio.prototype.pause call (debugging only)
  try{
    (function(){
      if(!window._kj_proto_pause_installed){
        window._kj_proto_pause_installed = true;
        window._kj_pause_calls = window._kj_pause_calls || [];
        const _orig = Audio.prototype.pause;
        Audio.prototype.pause = function(){
          try{
            const st = (new Error('proto-pause')).stack || '';
            window._kj_pause_calls.push({ t: Date.now(), src: this && this.src, stack: st.split('\n').slice(1,8).join('\n') });
            try{ console.debug('KJProtoPause', window._kj_pause_calls[window._kj_pause_calls.length-1]); }catch(e){}
          }catch(e){}
          return _orig.apply(this, arguments);
        };
      }
    })();
  }catch(e){}

  if (window.KJAudio) {
    console.debug('KJAudio: already initialized');
    return;
  }

  function create(){
    // SINGLETON ENFORCEMENT: prefer an existing <audio> in the DOM (id=player),
    // then `window.sharedPlayer`, otherwise create a new Audio(). This keeps
    // the visible player element and the singleton in sync.
    let audio = null;
    try{
      audio = window.sharedPlayer || document.querySelector('audio#player') || document.querySelector('audio') || null;
    }catch(e){ audio = window.sharedPlayer || null; }
    if(!audio){
      audio = new Audio();
      try{
        if(!audio.id) audio.id = 'player';
        // put the audio element into the document so browser/tab media controls
        // and Media Session APIs can associate with it. Keep it visually hidden
        // but not `display:none` (some browsers don't associate hidden elements).
        audio.controls = false;
        audio.setAttribute('aria-hidden','true');
        audio.style.position = 'fixed';
        audio.style.left = '-9999px';
        audio.style.width = '1px';
        audio.style.height = '1px';
        audio.style.opacity = '0';
        audio.style.pointerEvents = 'none';
        document.body.appendChild(audio);
      }catch(e){}
      window.sharedPlayer = audio;
    } else {
      // ensure shared reference
      window.sharedPlayer = audio;
    }
    audio.preload = audio.preload || 'metadata';

    // expose quick status in the debug panel
    try{ domLog('info', `audio@id=${audio.id||''} src=${audio.src||''} paused=${audio.paused} readyState=${audio.readyState}`); }catch(_){}
    try{ domLog('info', `window.audio=${!!window.audio} window.sharedPlayer=${!!window.sharedPlayer}`); }catch(_){}

    // Wrap pause to catch who calls it (stack trace) — helps find racing pauses
    try{
      const _origPause = audio.pause && audio.pause.bind(audio);
      if(typeof _origPause === 'function'){
        audio.pause = function(){
          try{
            const st = (new Error('pause-call')).stack || '';
            try{ console.debug('KJAudio: wrapped pause called', st); }catch(_){}
            try{ domLog('pause-call', st.split('\n').slice(1,6).join('\n')); }catch(_){}
          }catch(e){}
          return _origPause();
        };
      }
    }catch(e){}
    
    const listeners = { statechange: new Set(), error: new Set(), ended: new Set() };

    // debug panel disabled: return null to avoid injecting UI
    function ensureDebugPanel(){
      return null;
    }
    // Watch for proto pause calls and surface recent ones in the debug panel
    try{
      setInterval(()=>{
        try{
          const calls = (window._kj_pause_calls || []).splice(0);
          if(!calls || !calls.length) return;
          const p = ensureDebugPanel(); if(!p) return;
          calls.forEach(c=>{ try{ const el = document.createElement('div'); el.textContent = '[pause-call] '+(new Date(c.t)).toISOString()+" src="+(c.src||'')+"\n"+c.stack; el.style.whiteSpace='pre-wrap'; el.style.marginBottom='6px'; p.appendChild(el); }catch(e){} });
          // trim keeping header
          const max = 18; while(p.children.length > max) try{ p.removeChild(p.children[1]); }catch(e){ break; }
        }catch(e){}
      }, 700);
    }catch(e){}
    function showCopyModal(txt){
      try{
        const overlay = document.createElement('div');
        overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.background='rgba(0,0,0,0.6)'; overlay.style.display='flex'; overlay.style.alignItems='center'; overlay.style.justifyContent='center'; overlay.style.zIndex=100000;
        const box = document.createElement('div'); box.style.width='min(880px,90%)'; box.style.maxHeight='80%'; box.style.background='white'; box.style.color='black'; box.style.borderRadius='8px'; box.style.padding='12px'; box.style.display='flex'; box.style.flexDirection='column';
        const ta = document.createElement('textarea'); ta.style.flex='1'; ta.style.width='100%'; ta.style.height='320px'; ta.value = txt || '';
        const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='8px'; controls.style.marginTop='8px'; controls.style.justifyContent='flex-end';
        const close = document.createElement('button'); close.textContent='Close'; close.onclick = ()=>{ try{ document.body.removeChild(overlay); }catch(e){} };
        const copyBtn = document.createElement('button'); copyBtn.textContent='Copy to clipboard'; copyBtn.onclick = ()=>{ try{ if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(ta.value); copyBtn.textContent='Copied'; setTimeout(()=>copyBtn.textContent='Copy to clipboard',900); } else { ta.select(); document.execCommand('copy'); copyBtn.textContent='Copied'; setTimeout(()=>copyBtn.textContent='Copy to clipboard',900); } }catch(e){} };
        [copyBtn, close].forEach(b=>{ b.style.padding='6px 10px'; b.style.borderRadius='6px'; b.style.border='none'; b.style.cursor='pointer'; });
        controls.appendChild(copyBtn); controls.appendChild(close);
        box.appendChild(ta); box.appendChild(controls);
        overlay.appendChild(box); document.body.appendChild(overlay);
        ta.select(); ta.focus();
      }catch(e){}
    }
    function domLog(level, txt){
      try{
        const p = ensureDebugPanel();
        if(!p) return;
        const el = document.createElement('div');
        el.textContent = '['+level+'] '+String(txt);
        el.style.opacity = '0.95';
        el.style.marginBottom = '4px';
        el.style.pointerEvents = 'auto';
        p.appendChild(el);
        // Keep header (index 0) and trim older log lines while preserving header
        const max = 12;
        while(p.children.length > max){
          try{ p.removeChild(p.children[1]); }catch(e){ break; }
        }
      }catch(e){}
    }

    function emitState(){
      const s = getState();
      try{ console.debug('KJAudio: state', s); }catch(_){ }
      try{ domLog('state', JSON.stringify(s)); }catch(_){ }
      listeners.statechange.forEach(cb=>{ try{ cb(s); }catch(_){} });
    }

    audio.addEventListener('timeupdate', emitState);
    audio.addEventListener('play', ()=>{ console.debug('KJAudio: audio.play event'); emitState(); });
    audio.addEventListener('pause', ()=>{ console.debug('KJAudio: audio.pause event'); emitState(); });
    // keep media session state in sync with actual audio events
    try{
      audio.addEventListener('play', ()=>{ try{ if(navigator && navigator.mediaSession) navigator.mediaSession.playbackState = 'playing'; }catch(e){} });
      audio.addEventListener('pause', ()=>{ try{ if(navigator && navigator.mediaSession) navigator.mediaSession.playbackState = 'paused'; }catch(e){} });
    }catch(e){}
    audio.addEventListener('ended', ()=>{ console.debug('KJAudio: audio.ended'); listeners.ended.forEach(cb=>{ try{ cb(); }catch(_){} }); emitState(); });
    audio.addEventListener('error', (e)=>{ console.error('KJAudio: audio.error', e); try{ domLog('error', String(e)); }catch(_){}; listeners.error.forEach(cb=>{ try{ cb(e); }catch(_){} }); });

    async function setSource(src){
      console.debug('KJAudio.setSource()', src);
      if(!src) return false;
      try{
        // quick HEAD check (best-effort)
        try{
          const res = await fetch(src, { method: 'HEAD' });
          console.debug('KJAudio: HEAD', src, res.status);
          if (!res.ok && res.status !== 200 && res.status !== 206) {
            console.warn('KJAudio: HEAD returned non-OK, continuing to set src', res.status);
          }
        }catch(e){ console.debug('KJAudio: HEAD failed, continuing to set src', e); }
      }catch(e){ console.debug('KJAudio: HEAD failed, continuing to set src', e); }

      // set source and attempt to await metadata so play() has a better chance
      audio.src = src;
      audio.preload = 'metadata';
      emitState();

      try{
        await new Promise((resolve, reject)=>{
          let settled = false;
          const onLoaded = ()=>{ if(settled) return; settled = true; cleanup(); resolve(true); };
          const onError = (e)=>{ if(settled) return; settled = true; cleanup(); reject(e); };
          const onTimeout = ()=>{ if(settled) return; settled = true; cleanup(); resolve(false); };
          const cleanup = ()=>{ audio.removeEventListener('loadedmetadata', onLoaded); audio.removeEventListener('canplay', onLoaded); audio.removeEventListener('error', onError); };
          audio.addEventListener('loadedmetadata', onLoaded);
          audio.addEventListener('canplay', onLoaded);
          audio.addEventListener('error', onError);
          setTimeout(onTimeout, 5000);
        });
        console.debug('KJAudio: source loaded (or timed out)');
        try{ domLog('info','source loaded (or timed out)'); }catch(_){ }
      }catch(e){ console.debug('KJAudio: source load error', e); }

      emitState();
      // update Media Session metadata (best-effort)
      try{
        if(navigator && navigator.mediaSession){
          try{
            const parts = (src||'').split('/');
            const name = decodeURIComponent(parts[parts.length-1]||'');
            navigator.mediaSession.metadata = new MediaMetadata({ title: name || 'Audio', artist: '', album: '' });
            navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
          }catch(e){}
        }
      }catch(e){}
      return true;
    }

    function play(){
      console.debug('KJAudio.play()');
      try{ window.__kj_recent_user_play = true; setTimeout(()=>{ try{ window.__kj_recent_user_play = false; }catch(_){} }, 1200); }catch(e){}
      // Robustly check autoplay allow flag; if storage is inaccessible, don't fail fast.
      let allowed = false;
      try{
        allowed = window.__kj_allow_autoplay === true || (localStorage.getItem('kj_allow_autoplay') === '1');
      }catch(e){ console.debug('KJAudio.play: localStorage inaccessible, continuing with best-effort play', e); }

      try{ console.debug('KJAudio.play check', { allowed, __kj_allow_autoplay: window.__kj_allow_autoplay }); }catch(e){}

      // Always attempt to play; if the browser rejects, surface the error to caller
      return audio.play().then(ret=>{ try{ domLog('info','play() succeeded'); }catch(_){ } try{ if(navigator && navigator.mediaSession) navigator.mediaSession.playbackState = 'playing'; }catch(e){} return ret; }).catch(err=>{
        console.warn('KJAudio.play failed', err);
        try{ domLog('play-fail', String(err)); }catch(_){ }
        return Promise.reject(err);
      });
    }
    function pause(){ console.debug('KJAudio.pause()'); try{ audio.pause(); }catch(e){} try{ if(navigator && navigator.mediaSession) navigator.mediaSession.playbackState = 'paused'; }catch(e){} }
    function seek(t){ console.debug('KJAudio.seek()', t); try{ audio.currentTime = Math.max(0, Number(t)||0); }catch(e){ console.debug('KJAudio.seek error', e); } }
    function setRate(r){ console.debug('KJAudio.setRate()', r); audio.playbackRate = Number(r)||1; emitState(); }
    function getState(){ const s = { src: audio.src || undefined, time: Math.floor(audio.currentTime||0), duration: isNaN(audio.duration) ? undefined : audio.duration, paused: audio.paused, rate: audio.playbackRate }; console.debug('KJAudio.getState()', s); return s; }
    async function toggle(){
      try{
        if(audio.paused){
          try{ window.__kj_recent_user_play = true; setTimeout(()=>{ try{ window.__kj_recent_user_play = false; }catch(_){} }, 1200); }catch(e){}
          await play();
          return true;
        } else {
          pause();
          return false;
        }
      }catch(e){ console.debug('KJAudio.toggle error', e); return false; }
    }
    // Wire Media Session action handlers so external/tab controls route to KJAudio
    try{
      if(navigator && navigator.mediaSession){
        try{
          navigator.mediaSession.setActionHandler('play', ()=>{ try{ window.KJAudio && window.KJAudio.play(); }catch(e){} });
          navigator.mediaSession.setActionHandler('pause', ()=>{ try{ window.KJAudio && window.KJAudio.pause(); }catch(e){} });
          navigator.mediaSession.setActionHandler('stop', ()=>{ try{ window.KJAudio && window.KJAudio.pause(); }catch(e){} });
          navigator.mediaSession.setActionHandler('seekto', (details)=>{ try{ if(window.KJAudio && typeof window.KJAudio.seek==='function') window.KJAudio.seek(details.seekTime||0); }catch(e){} });
        }catch(e){}
      }
    }catch(e){}
    function on(ev, cb){ console.debug('KJAudio.on()', ev); if(listeners[ev]) listeners[ev].add(cb); }
    function off(ev, cb){ console.debug('KJAudio.off()', ev); if(listeners[ev]) listeners[ev].delete(cb); }

    return { setSource, play, pause, seek, setRate, getState, toggle, on, off };
  }

  window.KJAudio = create();
  console.info('KJAudio: initialized and available as window.KJAudio');
  // Convenience global helpers for legacy code paths to call without
  // repeating fallback logic in many inline scripts.
  try{
    window.KJ = window.KJ || {};
    window.KJ.play = async (src)=>{
      try{
        if(src && window.KJAudio && typeof window.KJAudio.setSource==='function') await window.KJAudio.setSource(src);
        if(window.KJAudio && typeof window.KJAudio.play==='function') return window.KJAudio.play();
        const a = window.sharedPlayer || window.audio;
        if(a && typeof a.play === 'function') return a.play();
        return Promise.reject(new Error('no-audio'));
      }catch(e){ return Promise.reject(e); }
    };
    window.KJ.pause = ()=>{
      try{ if(window.KJAudio && typeof window.KJAudio.pause==='function') return window.KJAudio.pause(); const a = window.sharedPlayer || window.audio; if(a && typeof a.pause==='function') return a.pause(); }catch(e){}
    };
    window.KJ.setSource = async (src)=>{ try{ if(window.KJAudio && typeof window.KJAudio.setSource==='function') return window.KJAudio.setSource(src); const a = window.sharedPlayer || window.audio; if(a) a.src = src; return true; }catch(e){ return false; } };
  }catch(e){}
  // dev toggle removed: no UI injected
  // Safe pause helper used by other inline scripts to avoid racing pauses.
  try{
    window.__kj_safePause = function(target){
      try{
        const el = (typeof target === 'string') ? document.querySelector(target) : (target || window.sharedPlayer || window.audio);
        if(!el) return;
        // If this is the shared singleton and a recent user play just occurred,
        // skip the pause to avoid kill-after-play races. Short timeout governed
        // by `window.__kj_recent_user_play` (set in play/toggle).
        // Allow explicit user interactions to pause even during the recent-user-play window.
        const now = Date.now();
        const lastInt = window.__kj_last_user_interaction || 0;
        const interactionRecent = (now - lastInt) < 800; // ms
        if((el === window.sharedPlayer || el === window.audio) && window.__kj_recent_user_play && !interactionRecent){
          try{ domLog('info', '__kj_safePause skipped due to recent user play'); }catch(_){}
          console.debug('__kj_safePause: skipped pause (recent user play)');
          return;
        }
        if(typeof el.pause === 'function') return el.pause();
      }catch(e){ console.debug('__kj_safePause error', e); }
    };
  }catch(e){}

  // Track recent user interactions (click/pointer) so explicit user-initiated
  // pauses are honored even if a recent play-guard flag is set.
  try{
    if(typeof document !== 'undefined' && !window.__kj_user_interaction_installed){
      window.__kj_user_interaction_installed = true;
      window.__kj_last_user_interaction = 0;
      ['pointerdown','click','keydown','touchstart'].forEach(ev => {
        document.addEventListener(ev, function(){ try{ window.__kj_last_user_interaction = Date.now(); }catch(e){} }, { capture: true, passive: true });
      });
    }
  }catch(e){}
})();
