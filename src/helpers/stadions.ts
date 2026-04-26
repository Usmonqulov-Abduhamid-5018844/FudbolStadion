import { IStadion } from './interface';

export const getStadionIds = (stadion: any): number[] => {
  if (stadion.parent_id) {
    return [stadion.id, stadion.parent_id];
  }

  const ids = [stadion.id];

  if (stadion.children?.length) {
    stadion.children.forEach((c: IStadion) => ids.push(c.id));
  }

  return ids;
};

export const getRelatedStadionIds = (stadion: any): number[] => {
  const ids = new Set<number>();

  if (stadion.parent_id) {
    return [stadion.id];
  }
  ids.add(stadion.id);

  if (stadion.children?.length) {
    stadion.children.forEach((c: any) => ids.add(c.id));
  }

  return Array.from(ids);
};

// export const getTodayStart = (timeZone = 'Asia/Tashkent') => {
//   const now = new Date();

//   const parts = new Intl.DateTimeFormat('en-CA', {
//     timeZone,
//     year: 'numeric',
//     month: '2-digit',
//     day: '2-digit',
//   }).formatToParts(now);

//   const year = parts.find(p => p.type === 'year')?.value;
//   const month = parts.find(p => p.type === 'month')?.value;
//   const day = parts.find(p => p.type === 'day')?.value;

//   return new Date(`${year}-${month}-${day}T00:00:00`);
// };
