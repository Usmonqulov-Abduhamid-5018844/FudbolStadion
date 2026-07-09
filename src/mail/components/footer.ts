import { StadiumReportData, esc } from '../weekly-report.types';

export function renderSummaryChecklist(summary: string[]): string {
  return `
<section>
  <div class="section-head"><span class="num">06</span><h2>Haftalik xulosa</h2></div>
  <div class="check-grid">
    ${summary.map((item) => `<div class="check-item"><span class="check-mark">✓</span> ${esc(item)}</div>`).join('')}
  </div>
</section>`;
}

export function renderFooter(data: StadiumReportData): string {
  return `
<footer>
  <div class="foot-title">${esc(data.brand)}'dan foydalanganingiz uchun rahmat</div>
  <div>${esc(data.supportEmail)}</div>
</footer>`;
}