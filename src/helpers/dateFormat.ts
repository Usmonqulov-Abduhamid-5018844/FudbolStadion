import { formatInTimeZone } from 'date-fns-tz';

export const APP_TZ = 'Asia/Tashkent';

export function formatDate(date: Date, lang: string = 'uz'): string {
  const months = {
    uz: [
      'Yanvar',
      'Fevral',
      'Mart',
      'Aprel',
      'May',
      'Iyun',
      'Iyul',
      'Avgust',
      'Sentabr',
      'Oktabr',
      'Noyabr',
      'Dekabr',
    ],
    ru: [
      'Января',
      'Февраля',
      'Марта',
      'Апреля',
      'Мая',
      'Июня',
      'Июля',
      'Августа',
      'Сентября',
      'Октября',
      'Ноября',
      'Декабря',
    ],
    en: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
  };

  return `${date.getDate()} ${months[lang][date.getMonth()]} ${date.getFullYear()}`;
}

const MONTHS_SHORT = {
  uz: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const monthsShort = (lang: string): string[] =>
  lang === 'ru' ? MONTHS_SHORT.ru : lang === 'en' ? MONTHS_SHORT.en : MONTHS_SHORT.uz;

export function formatDateTime(date: Date, lang: string): string {
  const day = Number(formatInTimeZone(date, 'Asia/Tashkent', 'd'));
  const month = Number(formatInTimeZone(date, 'Asia/Tashkent', 'M')) - 1;
  const year = formatInTimeZone(date, 'Asia/Tashkent', 'yyyy');
  const time = formatInTimeZone(date, 'Asia/Tashkent', 'HH:mm');
  return `${day} ${monthsShort(lang)[month]} ${year}, ${time}`;
}