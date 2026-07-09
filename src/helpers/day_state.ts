type DailyReport = {
  bookings: number;
  revenue: number;
  busiestStadium?: string;
  peakHours: string;
};

export const buildDailyReport = (bookings: any[]): DailyReport => {
  const revenue = bookings.reduce(
    (sum, b) => sum + Number(b.total_price || 0),
    0,
  );

  const stadiumCounts = new Map<string, number>();
  const hourCounts = new Array(24).fill(0);

  for (const b of bookings) {
    const stadiumName = b.stadion?.name ?? 'Noma\'lum stadion';

    stadiumCounts.set(
      stadiumName,
      (stadiumCounts.get(stadiumName) ?? 0) + 1,
    );

    if (b.startAt) {
      const hour = new Date(b.startAt).getHours();
      hourCounts[hour]++;
    }
  }

  const busiestStadium = [...stadiumCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  const maxCount = Math.max(...hourCounts);

  const peakHour = maxCount > 0 
    ? hourCounts.indexOf(maxCount)
    : 0;

  return {
    bookings: bookings.length,
    revenue,
    busiestStadium,
    peakHours: `${String(peakHour).padStart(2, '0')}:00–${String(
      peakHour + 1,
    ).padStart(2, '0')}:00`,
  };
};



type DailyReportText = {
  title: string;
  message: string;
};


export const renderDailyReport = (
  r: DailyReport,
  lang = 'uz',
): DailyReportText => {
  const reports = {
    uz: {
      title: '📊 Bugungi hisobot',
      message: `
📅 <b>Bronlar:</b> ${r.bookings}

💰 <b>Daromad:</b> ${r.revenue.toLocaleString('uz-UZ')} so'm

🏟 <b>Eng band stadion:</b> ${r.busiestStadium ?? '—'}

⏰ <b>Eng tig‘iz vaqt:</b> ${r.peakHours}
      `.trim(),
    },

    ru: {
      title: '📊 Отчёт за сегодня',
      message: `
📅 <b>Бронирования:</b> ${r.bookings}

💰 <b>Доход:</b> ${r.revenue.toLocaleString('ru-RU')} сум

🏟 <b>Самый загруженный стадион:</b> ${r.busiestStadium ?? '—'}

⏰ <b>Пиковое время:</b> ${r.peakHours}
      `.trim(),
    },

    en: {
      title: '📊 Today\'s Report',
      message: `
📅 <b>Bookings:</b> ${r.bookings}

💰 <b>Revenue:</b> ${r.revenue.toLocaleString('en-US')} UZS

🏟 <b>Busiest stadium:</b> ${r.busiestStadium ?? '—'}

⏰ <b>Peak hours:</b> ${r.peakHours}
      `.trim(),
    },
  };

  return reports[lang];
};