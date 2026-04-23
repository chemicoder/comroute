import { useEffect, useRef, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Play, Square, MapPin, MousePointer2 } from 'lucide-react';
import { Route } from '../types';
import { useApp } from '../lib/AppContext';
import { capHistory, MAX_HISTORY_POINTS, haversineKm } from '../lib/geo';

interface TrackingToggleProps {
  activeRoute: Route | null;
  onToggle: (isActive: boolean) => void;
  isPinpointing: boolean;
  setIsPinpointing: (val: boolean) => void;
}

const SESSION_KEY = 'routelive:tracking';
const MIN_MOVE_KM = 0.015; // 15m min distance between points to avoid spam

export default function TrackingToggle({
  activeRoute,
  onToggle,
  isPinpointing,
  setIsPinpointing,
}: TrackingToggleProps) {
  const { toast } = useApp();
  const [isTracking, setIsTracking] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const lastPointRef = useRef<{ lat: number; lng: number; t: number } | null>(null);

  // Resume tracking if we previously were tracking and come back to the same route
  useEffect(() => {
    if (!activeRoute) return;
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved === activeRoute.id && !isTracking) {
      // Auto-resume
      startTracking(true).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute?.id]);

  const stopTracking = async (silent = false) => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    if (activeRoute) {
      try {
        await updateDoc(doc(db, 'routes', activeRoute.id), { isActive: false });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `routes/${activeRoute.id}`);
      }
    }
    localStorage.removeItem(SESSION_KEY);
    setIsTracking(false);
    onToggle(false);
    if (!silent) toast('Tracking stopped', 'info');
  };

  const startTracking = async (silent = false) => {
    if (!auth.currentUser || !activeRoute) return;
    if (!('geolocation' in navigator)) {
      toast('Geolocation is not supported on this device', 'error');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const now = Date.now();
        const last = lastPointRef.current;
        if (last) {
          const dKm = haversineKm(last.lat, last.lng, latitude, longitude);
          if (dKm < MIN_MOVE_KM && now - last.t < 30_000) {
            return; // skip tiny / too-frequent updates
          }
        }
        lastPointRef.current = { lat: latitude, lng: longitude, t: now };

        const iso = new Date(now).toISOString();
        try {
          const newPoint = { lat: latitude, lng: longitude, updatedAt: iso };
          const nextHistory = capHistory(
            [...(activeRoute.history || []), newPoint],
            MAX_HISTORY_POINTS
          );
          await updateDoc(doc(db, 'routes', activeRoute.id), {
            currentLocation: newPoint,
            history: nextHistory,
            lastUpdated: iso,
            isActive: true,
          });
        } catch (error) {
          console.error('tracking update failed', error);
        }
      },
      (error) => {
        console.error(error);
        if (error.code === error.PERMISSION_DENIED) {
          toast('Location permission denied', 'error');
          stopTracking(true);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 }
    );
    setWatchId(id);
    setIsTracking(true);
    onToggle(true);
    localStorage.setItem(SESSION_KEY, activeRoute.id);
    if (!silent) toast('Tracking started', 'success');
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              isTracking
                ? 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400'
                : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
            }`}
          >
            <MapPin size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">Live Tracking</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isTracking ? 'Broadcasting location' : 'Not tracking'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPinpointing(!isPinpointing)}
            disabled={!activeRoute || isTracking}
            className={`p-2 rounded-lg transition-all ${
              isPinpointing
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            } ${(!activeRoute || isTracking) && 'opacity-50 cursor-not-allowed'}`}
            title="Manual Pinpoint"
          >
            <MousePointer2 size={18} />
          </button>

          <button
            onClick={() => (isTracking ? stopTracking() : startTracking())}
            disabled={!activeRoute || isPinpointing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              !activeRoute || isPinpointing
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                : isTracking
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isTracking ? (
              <>
                <Square size={16} fill="currentColor" />
                Stop
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                Start
              </>
            )}
          </button>
        </div>
      </div>

      {!activeRoute && (
        <p className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 p-2 rounded border border-amber-100 dark:border-amber-900 font-medium">
          Select or create a route to start tracking.
        </p>
      )}
      {isPinpointing && (
        <p className="text-[10px] text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 p-2 rounded border border-blue-100 dark:border-blue-900 font-medium">
          Pinpointing mode active. Click on map to update location.
        </p>
      )}
    </div>
  );
}
