/** Great-circle distance between two lat/lng points, in kilometers. */
export function haversineDistanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface LatLng {
  lat: number;
  lng: number;
}

/** Returns up to `count` items from `points` closest to `center`, excluding `center` itself, nearest first. */
export function nearestPoints<T extends LatLng>(center: LatLng, points: T[], count: number): T[] {
  return points
    .filter(p => p !== center)
    .map(p => ({ point: p, dist: haversineDistanceKm(center.lat, center.lng, p.lat, p.lng) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count)
    .map(p => p.point);
}
