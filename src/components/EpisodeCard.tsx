import React from 'react';
import '../styles/globals.css';

type Props = {
  id: string | number;
  title?: string;
  description?: string;
  cover?: string;
  file?: string;
  mime?: string;
  createdAt?: string | number;
  onPlay?: (id: string | number)=>void;
  onSelect?: (id: string | number)=>void;
};

export default function EpisodeCard({ id, title, description, cover, file, onPlay, onSelect }: Props){
  const handlePlay = (ev: React.MouseEvent)=>{
    ev.stopPropagation();
    if(onPlay) return onPlay(id);
    // fallback to global player if available
    try{
      const win: any = window as any;
      if(win && win.KJAudio && file){
        try{ win.__kj_allow_autoplay = true; setTimeout(()=>{ try{ win.__kj_allow_autoplay = false; }catch(_){} }, 2500); }catch(_){}
        win.KJAudio.setSource(file).then(ok=>{ if(ok) win.KJAudio.play(); });
        return;
      }
    }catch(e){ /* ignore */ }
  };
  const handleSelect = ()=>{ if(onSelect) onSelect(id); };

  return (
    <article className="card" tabIndex={0} onClick={handleSelect} onKeyDown={(e)=>{ if(e.key === 'Enter' || e.key === ' ') handleSelect(); }}>
      <div className="thumb" style={{backgroundImage:`url(${cover || '/placeholder.svg'})`, minHeight:120, backgroundSize:'cover', backgroundPosition:'center'}} aria-hidden="true"></div>
      <h3>{title || 'اپیزود'}</h3>
      {description && <p className="card-desc">{description}</p>}
      <div className="meta" style={{marginTop:8}}>
        {file ? (
          <button className="play-pill" aria-pressed="false" onClick={handlePlay} title="پخش">
            <span className="icon">▶</span>
            <span className="label">Play</span>
          </button>
        ) : (
          <span className="muted">بدون فایل</span>
        )}
      </div>
    </article>
  );
}
