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
