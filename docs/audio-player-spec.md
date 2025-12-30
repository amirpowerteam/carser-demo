# AudioPlayer Specification

هدف: تعریف یک پلیر صوتی singleton برای استفادهٔ سراسری در برنامه (وب‌سایت یا SPA) با API واضح، حالات، و رفتارهای قابل تست.

## اصول طراحی
- Singleton: تنها یک نمونهٔ فعال پلیر در کل اپلیکیشن وجود دارد.
- Deterministic API: متدها و رویدادها برای هماهنگی UI (دکمه‌ها، sticky player) و ذخیرهٔ حالت واضح باشند.
- Resilient: خطاها و منابع اشتباه (CORS, 404) به‌صورت قابل گزارش مدیریت شوند.

## Public API (پیشنهادی)

TypeScript interface (نمونه):

```ts
export type PlayerState = {
  src?: string;
  time: number;
  duration?: number;
  paused: boolean;
  rate: number;
};

export interface AudioPlayer {
  setSource(src: string): Promise<boolean>; // validate + set, return true if OK
  play(): Promise<void>;
  pause(): void;
  seek(time: number): void; // seconds
  setRate(rate: number): void;
  getState(): PlayerState;
  on(event: string, cb: (state: PlayerState)=>void): void;
  off(event: string, cb: (state: PlayerState)=>void): void;
}
```

## رفتارها و قراردادها
- setSource: باید ابتدا یک lightweight HEAD/Range check انجام دهد (در صورت نیاز) و تنها در صورت موفقیت منبع را ست کند. اگر ناموفق باشد، مقدار بازگردانده `false` است و نباید `src` تغییر کند.
- play(): اگر `src` تنظیم نشده باشد، باید خطای قابل کنترل ایجاد کند یا مقدار false/exception برگرداند.
- seek() باید تا حد ممکن از API داخلی پلیر (مثلاً `audio.currentTime`) استفاده کند و در حالت‌های ناشناخته (NaN) ایمن باشد.
- setRate(rate): نرخ‌های مجاز 0.5 تا 2 را پشتیبانی کند؛ نرخ پیش‌فرض 1.25 باشد.

## رویدادها
- `statechange` — فراخوانی با هر تغییر در state (pause/play/seek/rate/src)
- `error` — فراخوانی هنگام خطا (دسترسی، شبکه، decode)
- `ended` — هنگامی که پخش پایان می‌یابد

مثال رویدادها:

```ts
player.on('statechange', (s)=>{ /* update UI */ });
player.on('error', (s)=>{ /* show toast */ });
```

## persistence
- Persist minimal state در `localStorage` هر 1s: `{ src, time, paused, rate }` تا در ریفرش یا ناوبری دوباره قابل بازیابی باشد.
- هنگام بازیابی، فقط در صورتی `audio.play()` فراخوانی شود که `paused` false باشد و مرورگر اجازهٔ autoplay را بدهد.

## تعامل با UI
- کنترل‌های UI باید به API بالا متصل شوند و از رویداد `statechange` برای همگام‌سازی استفاده کنند.
- دکمه‌های play/pause باید حالت غیرفعال‌سازی (disabled) مناسبی هنگام بارگذاری یا خطا نشان دهند.

## تست‌ها
- Unit: شبیه‌سازی رفتارهای `setSource`, `play`, `pause`, `seek`, `setRate` و اطمینان از فراخوانی رویدادها.
- Integration: اجرای headless playback test (موجود: `scripts/headless-playback-test.js`) را به‌کار ببرید تا لنز رفتار پلیر در محیط واقعی بررسی شود.

## Edge cases
- منابع با CORS محدود یا با نیاز به Range ممکن است نیاز به proxy داشته باشند — مستند کنید که فایل‌های بزرگ باید از مسیر /media یا یک CDN قابل دسترس سرو شوند.
- اگر فایل از نوع تصویری باشد و پلیر برای آن set شود، باید خطا داده شود یا مسیری دیگر بازگردانده شود.

## نمونهٔ پیاده‌سازی (مینی)

این نمونه صرفاً برای راهنما است، پیاده‌سازی نهایی باید با Context و تست‌ها کامل شود.

```js
// simple singleton
class KJAudio {
  constructor(){
    if(window._kjPlayer) return window._kjPlayer;
    this.audio = new Audio();
    this.state = { time:0, paused:true, rate:1.25 };
    this.listeners = { statechange: new Set(), error: new Set(), ended: new Set() };
    this.audio.addEventListener('timeupdate', ()=> this._emit());
    this.audio.addEventListener('play', ()=>{ this.state.paused=false; this._emit(); });
    this.audio.addEventListener('pause', ()=>{ this.state.paused=true; this._emit(); });
    this.audio.addEventListener('ended', ()=> this._emitEvent('ended'));
    window._kjPlayer = this;
    return this;
  }
  async setSource(src){
    try{ const res = await fetch(src, { method:'HEAD' }); if(!res.ok) return false; this.audio.src = src; this.state.src = src; return true; }catch(e){ this._emitEvent('error', e); return false; }
  }
  play(){ return this.audio.play(); }
  pause(){ return this.audio.pause(); }
  seek(t){ this.audio.currentTime = Math.max(0, t); }
  setRate(r){ this.audio.playbackRate = r; this.state.rate = r; this._emit(); }
  getState(){ return { src: this.state.src, time: Math.floor(this.audio.currentTime), duration: this.audio.duration, paused: this.audio.paused, rate: this.audio.playbackRate }; }
  on(ev, cb){ if(this.listeners[ev]) this.listeners[ev].add(cb); }
  off(ev, cb){ if(this.listeners[ev]) this.listeners[ev].delete(cb); }
  _emit(){ const s = this.getState(); this.listeners.statechange.forEach(cb=>cb(s)); }
  _emitEvent(ev, arg){ if(this.listeners[ev]) this.listeners[ev].forEach(cb=>cb(arg)); }
}

window.KJAudio = new KJAudio();
```
