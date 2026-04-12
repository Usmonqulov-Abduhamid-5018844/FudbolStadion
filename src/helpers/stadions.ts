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