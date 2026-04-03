export type UserRole = 'commuter' | 'driver' | 'institute_admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: UserRole;
  createdAt: string;
}

export interface RouteLocation {
  lat: number;
  lng: number;
  updatedAt: string;
}

export interface RouteHistoryEntry extends RouteLocation {
  isOffRoute?: boolean;
}

export interface RouteAnalytics {
  earliestArrivalYear?: string;
  mostDelayedYear?: string;
  averageTimeMinutes?: number;
  lastDayTime?: string;
  todayTime?: string;
  tomorrowExpectedTime?: string;
}

export interface RouteStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  arrivalTime: string;
}

export interface Route {
  id: string;
  name: string;
  description?: string;
  busDetails?: {
    numberPlate?: string;
    model?: string;
    capacity?: number;
  };
  type: 'public' | 'private';
  status: 'active' | 'inactive';
  instituteId?: string;
  driverId: string;
  currentLocation?: RouteLocation;
  history?: RouteHistoryEntry[];
  plannedPath?: RouteLocation[]; // For manual route setting
  stops?: RouteStop[];
  estimatedDurationMinutes?: number;
  eta?: {
    arrivalTime: string;
    remainingMinutes: number;
    trafficStatus: 'low' | 'moderate' | 'high';
  };
  analytics?: RouteAnalytics;
  isActive: boolean;
  lastUpdated: string;
  invitedUsers?: string[]; // Array of UIDs for private routes
  shareableLink?: string;
}

export interface Institute {
  id: string;
  name: string;
  adminId: string;
  inviteCode: string;
}
