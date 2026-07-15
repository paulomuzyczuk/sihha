import {
  calculateDistanceInMeters,
  computeLocationVerified,
} from '../../services/geofence';

// The geofence is advisory in M3 (a submission is never rejected for location —
// the flag only records whether coordinates were present and inside the zone),
// so this locks the boundary math and the null-safety, not an HTTP 403. The
// Haversine distance was previously exercised only indirectly through the logs
// route; boundary and malformed-coordinate inputs had no coverage at all.

const ZONE = { geo_lat: -3.119, geo_lng: -60.0217, geo_radius_m: 200 };

describe('calculateDistanceInMeters (Haversine)', () => {
  it('is zero for identical coordinates', () => {
    expect(calculateDistanceInMeters(-3.119, -60.0217, -3.119, -60.0217)).toBe(
      0,
    );
  });

  it('matches the known ~111.19 km per degree of latitude', () => {
    const d = calculateDistanceInMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('is symmetric in its endpoints', () => {
    const ab = calculateDistanceInMeters(-3.119, -60.0217, -3.12, -60.02);
    const ba = calculateDistanceInMeters(-3.12, -60.02, -3.119, -60.0217);
    expect(ab).toBeCloseTo(ba, 6);
  });
});

describe('computeLocationVerified', () => {
  it('verifies a point at the exact recipient coordinates', () => {
    expect(
      computeLocationVerified(ZONE, { lat: ZONE.geo_lat, lng: ZONE.geo_lng }),
    ).toBe(true);
  });

  it('verifies a point just inside the radius (~111 m < 200 m)', () => {
    // 0.001° north of centre ≈ 111 m
    expect(
      computeLocationVerified(ZONE, {
        lat: ZONE.geo_lat + 0.001,
        lng: ZONE.geo_lng,
      }),
    ).toBe(true);
  });

  it('does not verify a point beyond the radius (~334 m > 200 m)', () => {
    // 0.003° north of centre ≈ 334 m
    expect(
      computeLocationVerified(ZONE, {
        lat: ZONE.geo_lat + 0.003,
        lng: ZONE.geo_lng,
      }),
    ).toBe(false);
  });

  it('does not verify when no location is supplied', () => {
    expect(computeLocationVerified(ZONE, null)).toBe(false);
    expect(computeLocationVerified(ZONE, undefined)).toBe(false);
  });

  it('does not verify when the recipient has no geofence configured', () => {
    const noZone = { geo_lat: null, geo_lng: null, geo_radius_m: null };
    expect(
      computeLocationVerified(noZone, { lat: -3.119, lng: -60.0217 }),
    ).toBe(false);
  });

  it('does not verify (and does not throw) on malformed NaN coordinates', () => {
    expect(computeLocationVerified(ZONE, { lat: NaN, lng: NaN })).toBe(false);
  });
});
