import { StadiumStats, fmt } from '../weekly-report.types';

export function renderSummaryCards(stats: StadiumStats): string {
  return `
<div class="wrap">
  <div class="tiles">
    <div class="tile">
      <div class="label">💰 Daromad</div>
      <div class="value">${fmt(stats.revenue)}<small> so'm</small></div>
      <div class="delta up">▲ +${stats.revenueDelta}%</div>
    </div>
    <div class="tile">
      <div class="label">📅 Bandlar</div>
      <div class="value">${fmt(stats.bookings)}</div>
      <div class="delta up">▲ +${stats.bookingsDelta}%</div>
    </div>
    <div class="tile">
      <div class="label">👥 Mijozlar</div>
      <div class="value">${fmt(stats.customers)}</div>
      <div class="delta neutral">+${fmt(stats.newCustomers)} yangi</div>
    </div>
    <div class="tile">
      <div class="label">📈 Bandlik</div>
      <div class="value">${stats.occupancy}<small>%</small></div>
      <div class="occ-bar"><span style="width:${stats.occupancy}%"></span></div>
    </div>
  </div>
</div>`;
}