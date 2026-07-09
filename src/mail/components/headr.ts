import { StadiumReportData, esc } from '../weekly-report.types';

export function renderHeader(data: StadiumReportData): string {
  return `
<header class="pitch-field">
  <div class="wrap">
    <div class="brand-row">
      <div class="brand">
        <div class="brand-mark">⚽</div>
        <div class="brand-text">
          <div class="eyebrow">${esc(data.brand)}</div>
          <h1>Haftalik hisobot</h1>
        </div>
      </div>
      <div class="status-chip"><span class="status-dot"></span> ${esc(data.status)}</div>
    </div>
    <div class="period-owner">
      <span>Davr: <strong>${esc(data.periodFrom)} — ${esc(data.periodTo)}</strong></span>
      <span>Egasi: <strong>${esc(data.owner)}</strong></span>
    </div>
  </div>
</header>`;
}