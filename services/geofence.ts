// Geofence verification against the recipient row (M3: TARGET_* env vars
// retired into care_recipients). Location stays best-effort — a submission
// is never rejected for it; the flag only records whether coordinates were
// present and inside the allowed zone.

interface GeofenceSource {
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_m: number | null;
}

export function calculateDistanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Earth radius
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Whether the submission's coordinates fall inside the recipient's allowed
 * zone. Geofencing is per-recipient and optional (design decision #3): a
 * recipient without one never verifies (false = "no claim made").
 */
export function computeLocationVerified(
  recipient: GeofenceSource,
  loc: { lat: number; lng: number } | null | undefined,
): boolean {
  if (loc == null) return false;
  if (
    recipient.geo_lat == null ||
    recipient.geo_lng == null ||
    recipient.geo_radius_m == null
  ) {
    return false;
  }

  const inZone =
    calculateDistanceInMeters(
      loc.lat,
      loc.lng,
      recipient.geo_lat,
      recipient.geo_lng,
    ) <= recipient.geo_radius_m;

  // Secondary DEBUG zone is a development convenience only — never active in
  // production, regardless of whether the DEBUG_* vars happen to be set.
  let inDebugZone = false;
  if (process.env.NODE_ENV !== 'production') {
    const debugLat = process.env.DEBUG_LAT;
    const debugLng = process.env.DEBUG_LNG;
    const debugRadius = process.env.DEBUG_RADIUS_METERS;
    inDebugZone =
      !!debugLat &&
      !!debugLng &&
      !!debugRadius &&
      calculateDistanceInMeters(
        loc.lat,
        loc.lng,
        parseFloat(debugLat),
        parseFloat(debugLng),
      ) <= parseFloat(debugRadius);
  }

  return inZone || inDebugZone;
}
