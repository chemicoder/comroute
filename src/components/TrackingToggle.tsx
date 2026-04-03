import { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Play, Square, MapPin, MousePointer2 } from 'lucide-react';
import { Route } from '../types';

interface TrackingToggleProps {
  activeRoute: Route | null;
  onToggle: (isActive: boolean) => void;
  isPinpointing: boolean;
  setIsPinpointing: (val: boolean) => void;
}

export default function TrackingToggle({ activeRoute, onToggle, isPinpointing, setIsPinpointing }: TrackingToggleProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);

  const startTracking = async () => {
    if (!auth.currentUser || !activeRoute) return;

    if ("geolocation" in navigator) {
      const id = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const now = new Date().toISOString();
          
          try {
            await updateDoc(doc(db, 'routes', activeRoute.id), {
              currentLocation: {
                lat: latitude,
                lng: longitude,
                updatedAt: now,
              },
              history: arrayUnion({
                lat: latitude,
                lng: longitude,
                updatedAt: now,
              }),
              lastUpdated: now,
              isActive: true
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `routes/${activeRoute.id}`);
          }
        },
        (error) => console.error(error),
        { enableHighAccuracy: true }
      );
      setWatchId(id);
      setIsTracking(true);
      onToggle(true);
    }
  };

  const stopTracking = async () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    
    if (activeRoute) {
      try {
        await updateDoc(doc(db, 'routes', activeRoute.id), {
          isActive: false
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `routes/${activeRoute.id}`);
      }
    }
    
    setIsTracking(false);
    onToggle(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-xl shadow-lg border border-slate-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isTracking ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
            <MapPin size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Live Tracking</h3>
            <p className="text-xs text-slate-500">{isTracking ? 'Broadcasting location' : 'Not tracking'}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPinpointing(!isPinpointing)}
            disabled={!activeRoute || isTracking}
            className={`p-2 rounded-lg transition-all ${
              isPinpointing 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            } ${(!activeRoute || isTracking) && 'opacity-50 cursor-not-allowed'}`}
            title="Manual Pinpoint"
          >
            <MousePointer2 size={18} />
          </button>

          <button
            onClick={isTracking ? stopTracking : startTracking}
            disabled={!activeRoute || isPinpointing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              !activeRoute || isPinpointing
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
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
        <p className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 font-medium">
          Select or create a route to start tracking.
        </p>
      )}
      {isPinpointing && (
        <p className="text-[10px] text-blue-600 bg-blue-50 p-2 rounded border border-blue-100 font-medium">
          Pinpointing mode active. Click on map to update location.
        </p>
      )}
    </div>
  );
}
