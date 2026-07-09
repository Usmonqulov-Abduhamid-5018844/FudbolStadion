import { FinanceSummary, fmt } from '../weekly-report.types';

export function renderFinance(finance: FinanceSummary): string {
  return `
<section>
  <div class="section-head"><span class="num">01</span><h2>Moliyaviy xulosa</h2></div>
  <div class="fin-list">
    <div class="fin-row highlight">
      <span class="fin-label">Umumiy daromad</span>
      <span class="fin-value">${fmt(finance.total)} so'm</span>
    </div>
    <div class="fin-row">
      <span class="fin-label">O'rtacha band narxi</span>
      <span class="fin-value">${fmt(finance.avgBooking)} so'm</span>
    </div>
    <div class="fin-row">
      <span class="fin-label">Eng yirik band</span>
      <span class="fin-value">${fmt(finance.maxBooking)} so'm</span>
    </div>
    <div class="fin-row">
      <span class="fin-label">Kunlik o'rtacha daromad</span>
      <span class="fin-value">${fmt(finance.avgDaily)} so'm</span>
    </div>
  </div>
</section>`;
}