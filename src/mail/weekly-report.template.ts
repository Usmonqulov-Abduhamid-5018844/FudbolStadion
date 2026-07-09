import { StadiumReportInput, StadiumReportData, withDefaults, esc } from './weekly-report.types';
import { renderHeader } from './components/headr';
import { renderSummaryCards } from './components/summary-cards';
import { renderFinance } from './components/finance';
import { renderStadiumPerformance } from './components/stadium-performance';
import { renderWeeklyChart } from './components/weekly-chart';
import { renderHighlights } from './components/highlights';
import { renderRecommendations } from './components/recommendations';
import { renderSummaryChecklist, renderFooter } from './components/footer';

const STYLE = `
  :root{
    --pitch-dark: #0a2118;
    --pitch: #0f2f22;
    --pitch-card: #14392a;
    --pitch-card-light: #1a4632;
    --line: rgba(245, 246, 240, 0.09);
    --floodlight: #f2c94c;
    --floodlight-dim: #c9a53d;
    --alert-red: #e8654a;
    --sky-blue: #4ba3c7;
    --ink: #f5f6f0;
    --ink-muted: #9fb8a8;
    --ink-dim: #6f8a7c;
    --display: 'Oswald', sans-serif;
    --mono: 'Space Mono', monospace;
    --body: 'Manrope', sans-serif;
  }

  *{ box-sizing:border-box; }

  body{
    margin:0;
    background: var(--pitch-dark);
    color: var(--ink);
    font-family: var(--body);
    -webkit-font-smoothing:antialiased;
  }

  .pitch-field{
    position:relative;
    overflow:hidden;
    background:
      repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0 40px, rgba(255,255,255,0) 40px 80px),
      var(--pitch);
    border-bottom:1px solid var(--line);
  }
  .pitch-field::before{
    content:"";
    position:absolute;
    top:50%; left:50%;
    width:340px; height:340px;
    border:1.5px solid rgba(245,246,240,0.06);
    border-radius:50%;
    transform:translate(-50%,-50%);
    pointer-events:none;
  }
  .pitch-field::after{
    content:"";
    position:absolute;
    top:50%; left:50%;
    width:1.5px; height:200%;
    background:rgba(245,246,240,0.06);
    transform:translate(-50%,-50%);
    pointer-events:none;
  }

  .wrap{ max-width:1080px; margin:0 auto; padding:0 28px; position:relative; z-index:1; }

  header.pitch-field{ padding:40px 0 32px; }
  .brand-row{
    display:flex; align-items:center; justify-content:space-between;
    flex-wrap:wrap; gap:16px;
    margin-bottom:26px;
  }
  .brand{ display:flex; align-items:center; gap:14px; }
  .brand-mark{
    width:46px; height:46px;
    border:2px solid var(--floodlight);
    border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-family:var(--display);
    font-weight:700; font-size:20px;
    color:var(--floodlight);
    flex-shrink:0;
  }
  .brand-text .eyebrow{
    font-family:var(--mono);
    font-size:11px; letter-spacing:0.18em;
    color:var(--ink-muted); text-transform:uppercase;
  }
  .brand-text h1{
    font-family:var(--display);
    font-weight:600; font-size:28px;
    letter-spacing:0.01em;
    margin:2px 0 0;
    text-transform:uppercase;
  }
  .status-chip{
    display:flex; align-items:center; gap:8px;
    font-family:var(--mono); font-size:12px;
    color:#8fe3a8;
    background:rgba(88,214,141,0.08);
    border:1px solid rgba(88,214,141,0.3);
    padding:7px 14px; border-radius:100px;
    text-transform:uppercase; letter-spacing:0.08em;
  }
  .status-dot{
    width:8px; height:8px; border-radius:50%;
    background:#58d68d;
    box-shadow:0 0 0 0 rgba(88,214,141,0.6);
    animation:pulse 2s infinite;
  }
  @media (prefers-reduced-motion: reduce){ .status-dot{ animation:none; } }
  @keyframes pulse{
    0%{ box-shadow:0 0 0 0 rgba(88,214,141,0.5); }
    70%{ box-shadow:0 0 0 8px rgba(88,214,141,0); }
    100%{ box-shadow:0 0 0 0 rgba(88,214,141,0); }
  }

  .period-owner{
    display:flex; justify-content:space-between; align-items:baseline;
    font-family:var(--mono); font-size:13px; color:var(--ink-muted);
    padding-top:16px; border-top:1px dashed var(--line);
    flex-wrap:wrap; gap:8px;
  }
  .period-owner strong{ color:var(--ink); font-weight:400; }

  .tiles{
    display:grid;
    grid-template-columns:repeat(4, 1fr);
    gap:1px;
    background:var(--line);
    border:1px solid var(--line);
    margin-top:26px;
  }
  .tile{ background:var(--pitch-card); padding:20px 18px; }
  .tile .label{
    display:flex; align-items:center; gap:8px;
    font-family:var(--mono); font-size:11px;
    letter-spacing:0.06em; text-transform:uppercase;
    color:var(--ink-muted); margin-bottom:14px;
  }
  .tile .value{
    font-family:var(--mono); font-weight:700;
    font-size:26px; line-height:1.1;
    color:var(--ink);
  }
  .tile .value small{ font-family:var(--body); font-weight:600; font-size:14px; color:var(--ink-muted); }
  .tile .delta{ margin-top:10px; font-size:12.5px; font-weight:600; }
  .delta.up{ color:#8fe3a8; }
  .delta.neutral{ color:var(--floodlight); }
  .occ-bar{
    margin-top:10px; height:5px; border-radius:3px;
    background:rgba(245,246,240,0.08); overflow:hidden;
  }
  .occ-bar span{
    display:block; height:100%; border-radius:3px;
    background:linear-gradient(90deg, var(--floodlight-dim), var(--floodlight));
  }

  @media (max-width:760px){ .tiles{ grid-template-columns:repeat(2,1fr); } }

  section{ padding:44px 0; border-bottom:1px solid var(--line); }
  section:last-of-type{ border-bottom:none; }
  .section-head{ display:flex; align-items:baseline; gap:12px; margin-bottom:22px; }
  .section-head .num{ font-family:var(--mono); font-size:12px; color:var(--floodlight-dim); }
  .section-head h2{
    font-family:var(--display); font-weight:600; font-size:20px;
    text-transform:uppercase; letter-spacing:0.03em; margin:0;
  }
  .section-head::after{ content:""; flex:1; height:1px; background:var(--line); }

  .fin-list{ border-top:1px solid var(--line); }
  .fin-row{
    display:flex; justify-content:space-between; align-items:center;
    padding:16px 4px; border-bottom:1px solid var(--line);
    font-family:var(--body);
  }
  .fin-row .fin-label{ color:var(--ink-muted); font-size:14.5px; }
  .fin-row .fin-value{ font-family:var(--mono); font-weight:700; font-size:17px; }
  .fin-row.highlight .fin-value{ color:var(--floodlight); }

  .stadium-row{
    display:grid;
    grid-template-columns:140px 1fr 150px 60px;
    align-items:center;
    gap:18px;
    padding:16px 0;
    border-bottom:1px solid var(--line);
  }
  .stadium-row:last-child{ border-bottom:none; }
  .stadium-name{
    font-family:var(--display); font-weight:500; font-size:15px;
    text-transform:uppercase; letter-spacing:0.02em;
  }
  .stadium-meta{ font-family:var(--mono); font-size:11px; color:var(--ink-dim); margin-top:3px; }
  .goal-track{ position:relative; height:10px; border-radius:2px; background:rgba(245,246,240,0.06); overflow:hidden; }
  .goal-track span{
    display:block; height:100%;
    background:repeating-linear-gradient(90deg, var(--sky-blue) 0 8px, #3a8bab 8px 16px);
    border-radius:2px;
  }
  .stadium-revenue{ font-family:var(--mono); font-size:14px; text-align:right; }
  .stadium-occ{ font-family:var(--mono); font-size:15px; font-weight:700; text-align:right; color:var(--floodlight); }

  .day-row{
    display:grid;
    grid-template-columns:100px 1fr 90px;
    align-items:center; gap:16px;
    padding:9px 0;
  }
  .day-name{
    font-family:var(--mono); font-size:12px; letter-spacing:0.05em;
    color:var(--ink-muted); text-transform:uppercase;
  }
  .day-track{ height:16px; background:rgba(245,246,240,0.05); border-radius:2px; overflow:hidden; }
  .day-fill{
    height:100%;
    background:linear-gradient(90deg, #1d5a3d, #2f8a5a);
    border-right:2px solid var(--floodlight);
    border-radius:2px 0 0 2px;
  }
  .day-row.peak .day-fill{ background:linear-gradient(90deg, #6b4a12, var(--floodlight)); }
  .day-count{ font-family:var(--mono); font-size:13px; text-align:right; }

  .highlight-grid{
    display:grid; grid-template-columns:repeat(4,1fr); gap:1px;
    background:var(--line); border:1px solid var(--line);
  }
  .h-card{ background:var(--pitch-card); padding:20px 18px; }
  .h-icon{ font-size:20px; margin-bottom:10px; display:block; }
  .h-label{
    font-family:var(--mono); font-size:10.5px; letter-spacing:0.06em;
    text-transform:uppercase; color:var(--ink-muted); margin-bottom:8px;
  }
  .h-value{ font-family:var(--display); font-size:18px; font-weight:600; }
  .h-sub{ font-family:var(--mono); font-size:12.5px; color:var(--floodlight); margin-top:4px; }
  @media (max-width:760px){ .highlight-grid{ grid-template-columns:repeat(2,1fr); } }

  .note{ display:flex; gap:14px; align-items:flex-start; padding:16px 0; border-bottom:1px dashed var(--line); }
  .note:last-child{ border-bottom:none; }
  .note-flag{ width:10px; height:10px; border-radius:50%; margin-top:5px; flex-shrink:0; }
  .note-flag.green{ background:#58d68d; }
  .note-flag.orange{ background:#e8a54a; }
  .note-flag.blue{ background:var(--sky-blue); }
  .note-title{ font-weight:700; font-size:14.5px; margin-bottom:3px; }
  .note-body{ font-size:13.5px; color:var(--ink-muted); line-height:1.5; }

  .check-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px 24px; }
  .check-item{ display:flex; gap:10px; align-items:center; font-size:14.5px; }
  .check-mark{
    width:20px; height:20px; border-radius:50%;
    background:rgba(88,214,141,0.12); color:#8fe3a8;
    display:flex; align-items:center; justify-content:center;
    font-size:12px; flex-shrink:0; border:1px solid rgba(88,214,141,0.35);
  }
  @media (max-width:600px){ .check-grid{ grid-template-columns:1fr; } }

  footer{ text-align:center; padding:36px 0 44px; font-family:var(--mono); font-size:12px; color:var(--ink-dim); }
  footer .foot-title{
    font-family:var(--display); font-size:14px; letter-spacing:0.08em;
    text-transform:uppercase; color:var(--ink-muted); margin-bottom:6px;
  }

  @media (max-width: 640px){
    .stadium-row{ grid-template-columns:1fr; gap:8px; }
    .stadium-revenue, .stadium-occ{ text-align:left; }
    .day-row{ grid-template-columns:70px 1fr 60px; }
  }
`;

export function renderWeeklyReportHtml(input: StadiumReportInput): string {
  const data: StadiumReportData = withDefaults(input);

  const body = `
${renderHeader(data)}
${renderSummaryCards(data.stats)}
<div class="wrap">
  ${renderFinance(data.finance)}
  ${renderStadiumPerformance(data.stadiums)}
  ${renderWeeklyChart(data.days)}
  ${renderHighlights(data.highlights)}
  ${renderRecommendations(data.recommendations)}
  ${renderSummaryChecklist(data.summary)}
</div>
${renderFooter(data)}`;

  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(data.brand)} — Haftalik Hisobot</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}