export interface CloudflareLocation {
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
}

export function getCloudflareLocation(request: { cf?: Record<string, unknown> }): CloudflareLocation;
