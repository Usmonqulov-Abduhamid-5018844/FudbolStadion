import { StadiumPerformance, fmt, esc } from '../weekly-report.types';

function stadiumRow(s: StadiumPerformance): string {
  return `
    <div class="stadium-row">
      <div>
        <div class="stadium-name">${esc(s.name)}</div>
        <div class="stadium-meta">${fmt(s.bookings)} bandlov</div>
      </div>
      <div class="goal-track"><span style="width:${s.occupancy}%"></span></div>
      <div class="stadium-revenue">${fmt(s.revenue)} so'm</div>
      <div class="stadium-occ">${s.occupancy}%</div>
    </div>`;
}

export function renderStadiumPerformance(stadiums: StadiumPerformance[]): string {
  return `
<section>
  <div class="section-head"><span class="num">02</span><h2>Stadionlar bo'yicha ko'rsatkichlar</h2></div>
  ${stadiums.map(stadiumRow).join('')}
</section>`;
}