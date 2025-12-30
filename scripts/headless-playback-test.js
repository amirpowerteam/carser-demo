const puppeteer = require('puppeteer');

(async ()=>{
  const url = process.env.URL || 'http://127.0.0.1:3000/episodes';
  console.log('Launching browser...');
  // fetch uploads server-side to avoid client-side timing issues
  let serverUploads = null;
  // retry logic: try multiple times to allow server to become ready
  const tryFetchServerUploads = async (attempts = 6, delayMs = 1000) => {
    const http = require('http');
    for(let i=0;i<attempts;i++){
      try{
        const data = await new Promise((resolve, reject)=>{
          const req = http.get('http://127.0.0.1:3000/api/uploads', (res)=>{
            let body = '';
            res.on('data', d=> body += d);
            res.on('end', ()=> resolve(body));
          });
          req.on('error', reject);
        });
        try{ return JSON.parse(data); }catch(e){ return null; }
      }catch(e){
        if(i < attempts-1) await new Promise(r=>setTimeout(r, delayMs));
        else throw e;
      }
    }
    return null;
  };

  try{
    serverUploads = await tryFetchServerUploads();
  }catch(e){ console.warn('server fetch uploads failed', e); }
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox'], headless: 'new'});
  const page = await browser.newPage();
  page.on('console', m => console.log('PAGE:', m.text()));
  await page.goto(url, { waitUntil: 'networkidle2' });
  console.log('Page loaded');
  // fetch first upload and request KJAudio to set source + play directly
  await page.waitForTimeout(800); // allow client scripts to initialize
  const pickFirstFile = (arr)=>{ if(!Array.isArray(arr)) return null; const it = arr.find(x=> x && x.file); return it ? it.file : null; };
  let file = pickFirstFile(serverUploads);
  // fallback: if server-side fetch failed or returned empty, try client-side fetch from the page
  if(!file){
    console.log('server-side uploads empty — trying client-side fetch');
    try{
      const clientRaw = await page.evaluate(async ()=>{
        try{
          const r = await fetch('/api/uploads');
          const txt = await r.text();
          console.log('client fetch raw length', txt && txt.length);
          return txt;
        }catch(e){ console.log('client fetch error', String(e)); return null; }
      });
      console.log('client raw length (node):', clientRaw ? clientRaw.length : null);
      try{ const clientUploads = clientRaw ? JSON.parse(clientRaw) : null; const cf = pickFirstFile(clientUploads); if(cf) file = cf; }
      catch(e){ console.warn('client JSON parse failed', e); }
    }catch(e){ console.warn('client-side fetch failed', e); }
  }
  if(!file){ console.error('No uploads available (server-side and client-side)'); await browser.close(); process.exit(2); }
  console.log('Using file:', file);
  // mute audio element to allow autoplay
  await page.evaluate(()=>{ try{ const a = window.sharedPlayer || document.querySelector('audio'); if(a) a.muted = true; }catch(e){} });
  const res = await page.evaluate(async (f)=>{
    try{
      if(!window.KJAudio) return { error:'no KJAudio' };
      const ok = await window.KJAudio.setSource(f);
      if(!ok) return { error:'setSource_failed' };
      await window.KJAudio.play().catch(()=>{});
      return window.KJAudio.getState();
    }catch(e){ return { error: String(e) } }
  }, file);
  console.log('Player state:', res);
  const ok = res && res.src && !res.paused;
  await browser.close();
  if(ok){ console.log('Playback test: SUCCESS'); process.exit(0); } else { console.error('Playback test: FAILED'); process.exit(3); }
})();
