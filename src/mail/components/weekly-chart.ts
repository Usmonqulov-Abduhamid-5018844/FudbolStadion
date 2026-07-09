import { DayStat, fmt, esc } from '../weekly-report.types';

function dayRow(day: DayStat, maxCount: number): string {
  const widthPct = maxCount > 0 ? Math.round((day.count / maxCount) * 100) : 0;
  const isPeak = day.count === maxCount && maxCount > 0;
  return `
    <div class="day-row${isPeak ? ' peak' : ''}">
      <div class="day-name">${esc(day.name)}</div>
      <div class="day-track"><div class="day-fill" style="width:${widthPct}%"></div></div>
      <div class="day-count">${fmt(day.count)}</div>
    </div>`;
}

export function renderWeeklyChart(days: DayStat[]): string {
  const maxCount = Math.max(0, ...days.map((d) => d.count || 0));
  return `
<section>
  <div class="section-head"><span class="num">03</span><h2>Kunlik faollik</h2></div>
  ${days.map((d) => dayRow(d, maxCount)).join('')}
</section>`;
}