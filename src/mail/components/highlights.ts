import { Highlights, fmt, esc } from '../weekly-report.types';

export function renderHighlights(highlights: Highlights): string {
  return `
<section>
  <div class="section-head"><span class="num">04</span><h2>Haftaning yutuqlari</h2></div>
  <div class="highlight-grid">
    <div class="h-card">
      <span class="h-icon">🥇</span>
      <div class="h-label">Eng ko'p daromad</div>
      <div class="h-value">${esc(highlights.topRevenue.name || '—')}</div>
      ${highlights.topRevenue.value ? `<div class="h-sub">${fmt(highlights.topRevenue.value)} so'm</div>` : ''}
    </div>
    <div class="h-card">
      <span class="h-icon">🔥</span>
      <div class="h-label">Eng ko'p bandlangan</div>
      <div class="h-value">${esc(highlights.topBooked.name || '—')}</div>
      ${highlights.topBooked.value ? `<div class="h-sub">${fmt(highlights.topBooked.value)} bandlov</div>` : ''}
    </div>
    <div class="h-card">
      <span class="h-icon">🕒</span>
      <div class="h-label">Eng yuqori talab soatlari</div>
      <div class="h-value">${esc(highlights.peakHours || '—')}</div>
    </div>
    <div class="h-card">
      <span class="h-icon">👤</span>
      <div class="h-label">Eng faol mijoz</div>
      <div class="h-value">${esc(highlights.topCustomer.name || '—')}</div>
      ${highlights.topCustomer.value ? `<div class="h-sub">${fmt(highlights.topCustomer.value)} bandlov</div>` : ''}
    </div>
  </div>
</section>`;
}