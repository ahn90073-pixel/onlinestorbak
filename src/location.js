const cleanLabel = (value, maxLength) => (typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength) || null
  : null);

const coordinate = (value, minimum, maximum) => {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

export function getCloudflareLocation(request) {
  const cf = request?.cf || {};
  const rawCountry = typeof cf.country === 'string' ? cf.country.trim() : '';
  return {
    locationCity: cleanLabel(cf.city, 100),
    locationRegion: cleanLabel(cf.region, 100),
    locationCountry: /^[A-Z]{2}$/i.test(rawCountry) ? rawCountry.toUpperCase() : null,
    locationLatitude: coordinate(cf.latitude, -90, 90),
    locationLongitude: coordinate(cf.longitude, -180, 180),
  };
}
