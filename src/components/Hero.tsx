import React, { useState, useEffect } from 'react';
import '../styles/globals.css';

type Props = {
  id?: string | number;
  title?: string;
  summary?: string;
  cover?: string;
  file?: string;
  meta?: string;
  onPlay?: (id?: string | number)=>void;
  onPause?: ()=>void;
};

export default function Hero({ id, title, summary, cover, file, meta, onPlay, onPause }: Props){
  const [playing, setPlaying] = useState(false);

  useEffect(()=>{
    // naive sync: if file changes, stop playing state
    setPlaying(false);
  }, [file]);

  const handlePlay = (e?: React.MouseEvent)=>{
    e && e.stopPropagation();
    if(!file) return;
    if(!playing){
      if(onPlay) onPlay(id);
      else {
        try{
          const win: any = window as any;
          // mark this as a user-initiated gesture so KJAudio.play is allowed
          try{ win.__kj_allow_autoplay = true; setTimeout(()=>{ try{ win.__kj_allow_autoplay = false; }catch(_){} }, 2500); }catch(e){}
          if(win && win.KJAudio){ win.KJAudio.setSource(file).then(ok=>{ if(ok) win.KJAudio.play(); }); }
        }catch(e){}
      }
      setPlaying(true);
    } else {
      if(onPause) onPause();
      else { try{ const win: any = window as any; if(win && win.KJAudio){ win.KJAudio.pause(); } }catch(e){} }
      setPlaying(false);
    }
  };

  return (
    <section className="hero">
      <div className="hero-wrapper card" style={{display:'flex',alignItems:'center',gap:24}}>
        <div className="hero-cover" style={{width:220,height:220,flex:'0 0 220px',backgroundImage:`url(${cover||'/placeholder.svg'})`,backgroundSize:'cover',backgroundPosition:'center',borderRadius:12}} id="heroCover">
        </div>
        <div className="hero-content" style={{flex:1}}>
          <h1 className="title" id="heroTitle">{title || 'در انتظار اپیزود جدید'}</h1>
          <p className="summary muted" id="heroSummary">{summary || 'خلاصه کوتاه اپیزودِ جدید اینجا نمایش داده می‌شود.'}</p>
          <div className="hero-controls" style={{marginTop:12,display:'flex',gap:12,alignItems:'center'}}>
            <button className="play-pill btn-primary" id="heroPlay" onClick={handlePlay} aria-pressed={playing}>
              <span className="icon">{playing ? '⏸' : '▶'}</span>
              <span className="label" style={{marginInlineStart:8}}>{playing ? 'Pause' : 'Play'}</span>
            </button>
            <span className="meta muted" id="heroMeta">{meta || '—'}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
