import { Recommendation, esc } from '../weekly-report.types';

function noteRow(n: Recommendation): string {
  return `
    <div class="note">
      <span class="note-flag ${n.flag}"></span>
      <div>
        <div class="note-title">${esc(n.title)}</div>
        <div class="note-body">${esc(n.body)}</div>
      </div>
    </div>`;
}

export function renderRecommendations(recommendations: Recommendation[]): string {
  return `
<section>
  <div class="section-head"><span class="num">05</span><h2>Tavsiyalar</h2></div>
  ${recommendations.map(noteRow).join('')}
</section>`;
}