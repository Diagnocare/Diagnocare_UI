/** Freshness band of a user's newest location. NoData = the phone has never reported. */
export type LocationStatus = 'Live' | 'Recent' | 'Stale' | 'Offline' | 'NoData';

export interface UserLatestLocation {
  userId: number;
  userName: string;
  role: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  /** ISO-8601 UTC. */
  capturedAt: string | null;
  minutesAgo: number | null;
  status: LocationStatus;
  /** Inside a geofence: its name. Otherwise the nearest one. */
  placeName: string | null;
  geofenceStatus: 'Inside' | 'Outside' | 'Unknown' | null;
  distanceMeters: number | null;
}

export interface LocationPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  source: string;
  placeName: string | null;
}

export interface LocationHistory {
  userId: number;
  userName: string;
  from: string;
  to: string;
  totalPoints: number;
  thinned: boolean;
  points: LocationPoint[];
}

export interface LocationSettings {
  enabled: boolean;
  trackingMode: 'ShiftWindow' | 'AllDay';
  shiftStart: string;
  shiftEnd: string;
  /** 0 = Sunday … 6 = Saturday. */
  trackDays: number[];
  intervalMinutes: number;
  minDistanceMeters: number;
  maxAccuracyMeters: number;
  offlineQueueEnabled: boolean;
  retentionDays: number;
  liveMinutes: number;
  staleMinutes: number;
  offlineMinutes: number;
}

