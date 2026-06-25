export const getDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c;
  return d;
};

export const stadionTypeLabel = (
  mini: boolean,
  stadion_mini: boolean,
  lang: string,
  i18n: any,
) => {
  const label = i18n.translate('stadions.type_label', { lang });
  let typeText = '';
  if (stadion_mini)
    typeText = i18n.translate('stadions.type.big_child', { lang });
  else if (mini) typeText = i18n.translate('stadions.type.mini', { lang });
  else typeText = i18n.translate('stadions.type.big', { lang });

  return `${label} <b>${typeText}</b>`;
};

export const getLocation = (
  latitude: number,
  longitude: number,
  regionName: string,
  regionItemName: string,
) => {
  return `<a href="https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}">${regionName}, ${regionItemName}</a>`;
};
