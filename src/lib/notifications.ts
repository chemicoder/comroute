import { haversineKm } from './geo';
import type { Route } from '../types';

const NOTIF_STATE_KEY = 'routelive:notified';

interface NotifState {
  [routeId: string]: { notifiedAt: number };
}

function readState(): NotifState {
  try {
    return JSON.parse(localStorage.getItem(NOTIF_STATE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeState(state: NotifState) {
  localStorage.setItem(NOTIF_STATE_KEY, JSON.stringify(state));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notificationStatus(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

const NEARBY_KM = 1.5;
const COOLDOWN_MS = 10 * 60 * 1000;

export function maybeNotifyNearby(
  userLocation: [number, number] | undefined,
  favoriteRoutes: Route[]
) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!userLocation) return;
  const state = readState();
  const now = Date.now();
  let changed = false;

  for (const route of favoriteRoutes) {
    if (!route.currentLocation || !route.isActive) continue;
    const dist = haversineKm(
      userLocation[0],
      userLocation[1],
      route.currentLocation.lat,
      route.currentLocation.lng
    );
    if (dist > NEARBY_KM) continue;
    const last = state[route.id]?.notifiedAt || 0;
    if (now - last < COOLDOWN_MS) continue;

    try {
      new Notification(`${route.name} is nearby`, {
        body: `Approximately ${dist.toFixed(1)} km away · ETA ${route.eta?.remainingMinutes ?? '?'} min`,
        icon: '/icon.svg',
        tag: `nearby-${route.id}`,
      });
      state[route.id] = { notifiedAt: now };
      changed = true;
    } catch {
      // noop
    }
  }

  if (changed) writeState(state);
}
