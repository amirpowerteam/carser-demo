(function(){
  const PAGE_SIZE = 12;
  let allItems = [];
  let filtered = [];
  let page = 0;

  const listEl = document.getElementById('list');
  const searchEl = document.getElementById('search');
  const tagEl = document.getElementById('filterTag');
  const loadMoreBtn = document.getElementById('loadMore');
  const clearBtn = document.getElementById('clearSearch');

  function setLoading(on){ if(loadMoreBtn) loadMoreBtn.disabled = on; }

  async function loadData(){
    setLoading(true);
    try{
      const res = await fetch('/api/uploads');
      if(!res.ok) throw new Error('fetch failed');
      allItems = await res.json();
    }catch(e){ allItems = []; console.error(e); }
    buildTagList();
    applyFilters();
    setLoading(false);
  }

  function buildTagList(){
    if(!tagEl) return;
    const tags = new Set();
    for(const it of allItems){ if(it.tags) for(const t of it.tags) tags.add(t); }
    // clear but keep default option
    const cur = tagEl.value || '';
    tagEl.innerHTML = '<option value="">همه</option>' + [...tags].map(t=>`<option value="${t}">${t}</option>`).join('');
    tagEl.value = cur;
  }

  function applyFilters(){
    const q = (searchEl && searchEl.value || '').trim().toLowerCase();
    const tag = (tagEl && tagEl.value) || '';
    filtered = allItems.filter(it=>{
      if(tag && (!it.tags || !it.tags.includes(tag))) return false;
      if(!q) return true;
      const s = (it.title||'') + ' ' + (it.description||'') + ' ' + (it.slug||'');
      return s.toLowerCase().includes(q);
    });
    page = 0;
    renderPage(true);
  }

  function renderPage(reset){
    const start = page * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const slice = filtered.slice(start, end);
    if(reset) listEl.innerHTML = '';
    if(slice.length===0 && start===0){ listEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted)">نتیجه‌ای یافت نشد</div>'; }
    for(const it of slice) appendCard(it);
    // toggle load more
    if(loadMoreBtn) loadMoreBtn.style.display = (end < filtered.length) ? 'inline-block' : 'none';
  }

  function appendCard(it){
    const c = document.createElement('div'); c.className='ep-card';
    // thumbnail as link
    const idParam = encodeURIComponent(it.id ?? it.slug ?? it.file ?? '');
    const link = document.createElement('a'); link.className='thumb-link'; link.href = `/episode.html?id=${idParam}`;
    const thumb = document.createElement('div'); thumb.className='ep-thumb'; thumb.style.backgroundImage = `url('${it.cover || '/placeholder.svg'}')`;
    link.appendChild(thumb);
    c.appendChild(link);

    // overlay preview shown on hover
    const overlay = document.createElement('div'); overlay.className = 'thumb-overlay';
    const excerpt = document.createElement('div'); excerpt.className='excerpt'; excerpt.textContent = it.description || '';
    const mini = document.createElement('div'); mini.className='mini-play'; mini.textContent = '▶ پخش / مشاهده جزئیات';
    overlay.appendChild(excerpt);
    overlay.appendChild(mini);
    c.appendChild(overlay);

    const h = document.createElement('h3');
    const a = document.createElement('a'); a.href = `/episode.html?id=${idParam}`; a.textContent = it.title || it.description || 'اپیزود'; a.style.color='inherit'; a.style.textDecoration='none';
    h.appendChild(a);
    c.appendChild(h);
    if(it.description){ const p = document.createElement('p'); p.textContent = it.description; p.style.opacity='0.8'; p.style.fontSize='0.95rem'; c.appendChild(p); }
    const controls = document.createElement('div'); controls.style.marginTop='8px';
    if(it.file){
      const play = document.createElement('button'); play.className='play-pill small'; play.innerHTML = `<span class="icon">▶</span> <span class="label">پخش</span>`;
      play.addEventListener('click', async ()=>{
        try{
          const kj = window.KJAudio;
          if(kj){ await kj.setSource(it.file); await kj.play(); }
          else {
            const aEl = window.sharedPlayer || window.audio || new Audio();
            try{ if(!window.sharedPlayer) window.sharedPlayer = aEl; }catch(e){}
            aEl.src = it.file;
            try{
              if (window.KJ && typeof window.KJ.play === 'function') {
                window.KJ.play().catch(()=>{});
              } else {
                aEl.play().catch(()=>{});
              }
            }catch(e){ try{ aEl.play && aEl.play().catch(()=>{}); }catch(_){} }
          }
        }catch(e){console.error(e)}
      });
      controls.appendChild(play);
      const dl = document.createElement('a'); dl.href = it.file; dl.target='_blank'; dl.textContent='دانلود'; dl.style.marginLeft='8px'; controls.appendChild(dl);
    }
    c.appendChild(controls);
    listEl.appendChild(c);
  }

  // events
  if(searchEl) searchEl.addEventListener('input', debounce(applyFilters, 250));
  if(tagEl) tagEl.addEventListener('change', applyFilters);
  if(clearBtn) clearBtn.addEventListener('click', ()=>{ if(searchEl) searchEl.value=''; applyFilters(); });
  if(loadMoreBtn) loadMoreBtn.addEventListener('click', ()=>{ page++; renderPage(false); });

  // Infinite scroll: when near bottom, load next page automatically
  let loadingMore = false;
  function onScroll(){
    if(loadingMore) return;
    const end = (page+1)*PAGE_SIZE;
    if(end >= filtered.length) return; // nothing more
    const threshold = 600; // px from bottom
    if((window.innerHeight + window.scrollY) >= (document.body.offsetHeight - threshold)){
      loadingMore = true;
      page++;
      renderPage(false);
      // small debounce
      setTimeout(()=>{ loadingMore = false; }, 300);
    }
  }
  window.addEventListener('scroll', debounce(onScroll, 150));

  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }

  // init
  loadData();

})();
