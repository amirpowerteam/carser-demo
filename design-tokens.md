# Design Tokens — Ketab Jibi

این فایل مجموعهٔ توکن‌های طراحی (رنگ، تایپوگرافی، فاصله، شعاع‌ها) را تعریف می‌کند تا پیاده‌سازی استایل‌ها در تمام کامپوننت‌ها یکپارچه باشد.

## Colors
- --color-bg: #FFFFFF
- --color-surface: #F9F9F9
- --color-text: #1A1A1A
- --color-muted: #6B6B6B
- --color-accent: #E67E22
- --color-accent-2: #3498DB
- --color-border: #EEEEEE
- --color-warning: #FFF3BF

## Typography
- --font-family-base: Vazirmatn, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial
- --type-h1: 2.25rem
- --type-h2: 1.75rem
- --type-h3: 1.25rem
- --type-body: 1rem
- --line-height-body: 1.8

## Spacing
- --space-xs: 4px
- --space-sm: 8px
- --space-md: 16px
- --space-lg: 24px
- --space-xl: 40px

## Radii & Elevation
- --radius-sm: 6px
- --radius-md: 12px
- --elevation-1: 0 1px 2px rgba(0,0,0,0.04)

## Usage examples
در CSS می‌توان از این توکن‌ها به‌صورت زیر استفاده کرد:

```css
:root {
  --color-bg: #FFFFFF;
  --color-text: #1A1A1A;
}

body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-family-base); }
.card { background: var(--color-surface); border-radius: var(--radius-md); box-shadow: var(--elevation-1); }
```

## Notes
- در این پروژه فایل فونت محلی در `fonts/vazirmatn-local.css` موجود است؛ در CSS اصلی آن را import کنید.
- این فایل صرفاً مرجع است؛ مقادیر می‌توانند حین پیاده‌سازی یا بررسی دست‌خوش تغییر شوند.
