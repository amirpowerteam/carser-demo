# Component Specifications — EpisodeCard & Hero

این سند مشخصات دو کامپوننت کلیدی را تعریف می‌کند: `EpisodeCard` و `Hero`. شامل props، رفتار، و نمونهٔ JSX/HTML است تا هنگام پیاده‌سازی در React/Next.js یا در HTML خالص راهنما باشد.

---

## EpisodeCard

- Purpose: نمایش خلاصهٔ یک اپیزود در گرید یا لیست؛ قابل کلیک برای انتخاب/پخش یا باز کردن صفحهٔ جزئیات.
- Props (پیشنهادی):
  - `id: string | number`
  - `title?: string`
  - `description?: string`
  - `cover?: string` (آدرس تصویر)
  - `file?: string` (مسیر فایل صوتی)
  - `mime?: string` (نوع مدیا)
  - `createdAt?: string | number`
  - `onPlay?: (id)=>void`
  - `onSelect?: (id)=>void`

### Behavior
- Click on the card: call `onSelect(id)` and set as hero item.
- Click on internal Play button: call `onPlay(id)`; UI should toggle play/pause based on global player state.
- Show fallback cover (`/placeholder.svg`) if `cover` missing.

### Accessibility
- Play button must have `aria-pressed` and screen-reader label.
- Card should be focusable and activate on Enter/Space.

### Sample JSX (React)

```jsx
function EpisodeCard({id,title,description,cover,file,onPlay,onSelect}){
  return (
    <article className="card" tabIndex={0} onClick={()=>onSelect && onSelect(id)} onKeyDown={(e)=>{ if(e.key==='Enter') onSelect && onSelect(id); }}>
      <div className="thumb" style={{backgroundImage:`url(${cover||'/placeholder.svg'})`}} aria-hidden="true"></div>
      <h3>{title||'اپیزود'}</h3>
      {description && <p className="card-desc">{description}</p>}
      <div className="meta">{file ? (<button className="play-pill" onClick={(ev)=>{ ev.stopPropagation(); onPlay && onPlay(id); }} aria-pressed="false"><span className="icon">▶</span><span className="label">Play</span></button>) : null}</div>
    </article>
  );
}
```

---

## Hero

- Purpose: نمایش اپیزود منتخب در بالای صفحه به‌صورت برجسته؛ شامل کاور، عنوان، خلاصه و کنترل پخش.
- Props:
  - `id`, `title`, `summary`, `cover`, `file`, `meta` (متادیتا مانند تاریخ/مدت)
  - `onPlay`, `onPause`, `onSelect`

### Behavior
- اگر کاربر روی کارت کلیک کند، Hero باید قفل شود (user-locked) و به‌مدت مشخصی از پیمایش خودکار محافظت شود.
- Play/Pause باید وضعیت پلیر singleton را کنترل کند و از رویدادهای `statechange` برای همگام‌سازی استفاده کند.

### Sample HTML/JS

```html
<section class="hero">
  <div class="hero-wrapper">
    <div class="hero-cover" id="heroCover">
      <img id="heroImg" src="/placeholder.svg" alt="hero cover" />
      <div class="hero-content">
        <h1 id="heroTitle">عنوان اپیزود</h1>
        <p class="summary" id="heroSummary">خلاصه کوتاه اپیزود اینجا نمایش داده می‌شود.</p>
        <div class="hero-controls">
          <button class="play-pill" id="heroPlay"><span class="icon">▶</span><span class="label">Play</span></button>
          <span class="meta" id="heroMeta">—</span>
        </div>
      </div>
    </div>
  </div>
</section>
```

### Notes
- Keep Hero markup lightweight; lazy-load large images and hide `<img>` when not available to fall back to background gradients.
- Ensure RTL layout and typography; use tokens from `design-tokens.md` and `src/styles/globals.css`.

---

If you want, I can also scaffold `src/components/EpisodeCard.tsx` and `src/components/Hero.tsx` with the above React versions. Shall I create those files now? 
