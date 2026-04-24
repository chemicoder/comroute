import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route as RouterRoute,
  useParams,
} from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User as FirebaseUser,
  signOut,
} from 'firebase/auth';
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import {
  Bus,
  Search as SearchIcon,
  LogOut,
  User as UserIcon,
  Plus,
  ChevronRight,
  ShieldCheck,
  Map as MapIcon,
  Clock,
  TrendingUp,
  X,
  Share2,
  AlertTriangle,
  Activity,
  Star,
  Moon,
  Sun,
  Bell,
  BellOff,
  Navigation2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import Map from './components/Map';
import Search from './components/Search';
import TrackingToggle from './components/TrackingToggle';
import InstitutePanel from './components/InstitutePanel';
import { Route, UserProfile, RouteStop } from './types';
import { AppProvider, useApp } from './lib/AppContext';
import { ErrorBoundary } from './lib/ErrorBoundary';
import { haversineKm, capHistory, MAX_HISTORY_POINTS } from './lib/geo';
import {
  requestNotificationPermission,
  notificationStatus,
  maybeNotifyNearby,
} from './lib/notifications';

function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ShareView() {
  const { routeId } = useParams();
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!routeId) return;
    const unsubscribe = onSnapshot(doc(db, 'routes', routeId), (docSnap) => {
      if (docSnap.exists()) {
        setRoute({ id: docSnap.id, ...docSnap.data() } as Route);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [routeId]);

  if (loading) return <Spinner />;
  if (!route)
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold">
        Route not found or link expired.
      </div>
    );

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950">
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <Bus size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{route.name}</h1>
            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
              Shared Live View
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${route.isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}
          />
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
            {route.isActive ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>
      <div className="flex-1 relative">
        <Map routes={[route]} selectedRouteId={route.id} showTraffic={true} />
        <div className="absolute bottom-6 left-6 right-6 lg:left-auto lg:right-6 lg:w-96 z-[1000] bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <Bus size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">{route.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {route.busDetails?.numberPlate || 'No Plate'}
              </p>
            </div>
          </div>
          <div className="p-4 bg-slate-900 dark:bg-slate-800 rounded-2xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase text-slate-400">Estimated Arrival</span>
              <span className="text-[10px] font-bold uppercase text-blue-400">Live</span>
            </div>
            <p className="text-3xl font-bold">{route.eta?.arrivalTime || '—'}</p>
            <div className="mt-2 flex items-center justify-between text-[10px]">
              <span className="text-slate-400 uppercase">
                Traffic: {route.eta?.trafficStatus || 'unknown'} (est.)
              </span>
              <span className="text-blue-400 font-bold">
                {route.eta?.remainingMinutes ?? '—'} mins away
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const { theme, toggleTheme, favorites, toggleFavorite, isFavorite, toast } = useApp();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [, setUserProfile] = useState<UserProfile | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>();
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [view, setView] = useState<'map' | 'institute'>('map');
  const [loading, setLoading] = useState(true);
  const [isPinpointing, setIsPinpointing] = useState(false);
  const [manualPin, setManualPin] = useState<[number, number] | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showTraffic, setShowTraffic] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>('default');

  const [showNewRouteForm, setShowNewRouteForm] = useState(false);
  const [newRouteData, setNewRouteData] = useState({
    name: '',
    description: '',
    busNumber: '',
    busModel: '',
  });

  useEffect(() => {
    setNotifPerm(notificationStatus());
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || '',
              role: 'commuter',
              createdAt: new Date().toISOString(),
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setUserProfile(newProfile);
          }
        } catch (error) {
          console.error('profile load failed', error);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setRoutes([]);
      return;
    }
    const q = query(collection(db, 'routes'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Route);
        setRoutes(fetched);
        if (activeRoute) {
          const updated = fetched.find((r) => r.id === activeRoute.id);
          if (updated) setActiveRoute(updated);
        }
      },
      (error) => {
        if (auth.currentUser) handleFirestoreError(error, OperationType.LIST, 'routes');
      }
    );
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeRoute?.id]);

  const [filterType, setFilterType] = useState<'all' | 'public' | 'private' | 'favorites'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  const filteredRoutes = useMemo(() => {
    let list = routes;
    if (filterType === 'favorites') list = list.filter((r) => favorites.includes(r.id));
    else if (filterType !== 'all') list = list.filter((r) => r.type === filterType);
    if (filterStatus !== 'all') list = list.filter((r) => r.status === filterStatus);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.busDetails?.numberPlate?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [routes, filterType, filterStatus, searchQuery, favorites]);

  useEffect(() => {
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => setUserLocation([position.coords.latitude, position.coords.longitude]),
        (error) => console.error(error),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  const lastEtaCallRef = useRef<{ routeId: string; t: number } | null>(null);

  useEffect(() => {
    if (!activeRoute?.currentLocation || !activeRoute.isActive) return;

    const calculateETA = async () => {
      const now = Date.now();
      const last = lastEtaCallRef.current;
      if (last && last.routeId === activeRoute.id && now - last.t < 25_000) return;
      lastEtaCallRef.current = { routeId: activeRoute.id, t: now };

      const current = activeRoute.currentLocation!;
      let destLat = current.lat + 0.05;
      let destLng = current.lng + 0.05;

      if (activeRoute.stops && activeRoute.stops.length > 0) {
        destLat = activeRoute.stops[0].lat;
        destLng = activeRoute.stops[0].lng;
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${current.lng},${current.lat};${destLng},${destLat}?overview=false`,
          { signal: controller.signal }
        );
        clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          if (data.routes && data.routes[0]) {
            const durationSeconds = data.routes[0].duration;
            const hour = new Date().getHours();
            const isRushHour = (hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 20);
            const trafficMultiplier = showTraffic && isRushHour ? 1.2 : 1.0;
            const remainingMinutes = Math.round(
              (durationSeconds * trafficMultiplier) / 60
            );
            const arrivalTime = new Date(now + remainingMinutes * 60000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const trafficStatus = isRushHour && showTraffic ? 'high' : 'moderate';

            if (
              !activeRoute.eta ||
              Math.abs(activeRoute.eta.remainingMinutes - remainingMinutes) > 2
            ) {
              await updateDoc(doc(db, 'routes', activeRoute.id), {
                eta: { arrivalTime, remainingMinutes, trafficStatus },
              });
            }
            return;
          }
        }
      } catch (e) {
        // fall through to haversine fallback
      }

      try {
        const distance = haversineKm(current.lat, current.lng, destLat, destLng);
        const avgSpeed = 30;
        const remainingMinutes = Math.round((distance / avgSpeed) * 60);
        const arrivalTime = new Date(now + remainingMinutes * 60000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        if (
          !activeRoute.eta ||
          Math.abs(activeRoute.eta.remainingMinutes - remainingMinutes) > 2
        ) {
          await updateDoc(doc(db, 'routes', activeRoute.id), {
            eta: {
              arrivalTime,
              remainingMinutes,
              trafficStatus: remainingMinutes > 15 ? 'high' : 'moderate',
            },
          });
        }
      } catch (e) {
        console.error('Fallback ETA update failed', e);
      }
    };

    const interval = setInterval(calculateETA, 30_000);
    calculateETA();
    return () => clearInterval(interval);
  }, [activeRoute?.id, activeRoute?.currentLocation, showTraffic]);

  useEffect(() => {
    if (notifPerm !== 'granted') return;
    const favRoutes = routes.filter((r) => favorites.includes(r.id));
    maybeNotifyNearby(userLocation, favRoutes);
  }, [routes, favorites, userLocation, notifPerm]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
      const code = (error as { code?: string })?.code ?? '';
      if (code === 'auth/unauthorized-domain') {
        toast(
          `Add "${window.location.hostname}" to Firebase Console → Auth → Settings → Authorized domains, then retry.`,
          'error',
        );
      } else if (code === 'auth/popup-blocked') {
        toast('Popup blocked — allow popups for this site and retry.', 'error');
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      } else {
        toast(`Sign-in failed${code ? ` (${code})` : ''}. Please try again.`, 'error');
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSearch = useCallback((q: string) => setSearchQuery(q), []);

  const onPinpoint = async (lat: number, lng: number) => {
    if (!activeRoute) return;
    setManualPin([lat, lng]);
    setIsUpdating(true);
    const now = new Date().toISOString();
    try {
      const newHistory = capHistory([
        ...(activeRoute.history || []),
        { lat, lng, updatedAt: now },
      ], MAX_HISTORY_POINTS);

      await updateDoc(doc(db, 'routes', activeRoute.id), {
        currentLocation: { lat, lng, updatedAt: now },
        history: newHistory,
        lastUpdated: now,
        isActive: true,
      });
      setIsPinpointing(false);
      setManualPin(null);
      toast('Location updated', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${activeRoute.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const createPublicRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsUpdating(true);
    try {
      const newRoute = {
        name: newRouteData.name || `${user.displayName}'s Route`,
        description: newRouteData.description,
        busDetails: {
          numberPlate: newRouteData.busNumber,
          model: newRouteData.busModel,
        },
        type: 'public',
        status: 'active',
        driverId: user.uid,
        isActive: true,
        lastUpdated: new Date().toISOString(),
        stops: [],
        analytics: {
          averageTimeMinutes: 45,
        },
      };
      const docRef = await addDoc(collection(db, 'routes'), newRoute);
      setActiveRoute({ id: docRef.id, ...newRoute } as Route);
      setShowNewRouteForm(false);
      setNewRouteData({ name: '', description: '', busNumber: '', busModel: '' });
      toast('Route created', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'routes');
    } finally {
      setIsUpdating(false);
    }
  };

  const generateShareLink = async () => {
    if (!activeRoute) return;
    const link = `${window.location.origin}${import.meta.env.BASE_URL}share/${activeRoute.id}`;
    try {
      await updateDoc(doc(db, 'routes', activeRoute.id), { shareableLink: link });
      if (navigator.share) {
        try {
          await navigator.share({
            title: `${activeRoute.name} · RouteLive`,
            text: 'Track this route live on RouteLive.',
            url: link,
          });
          return;
        } catch {
          // user cancelled share, fall through to clipboard
        }
      }
      await navigator.clipboard.writeText(link);
      toast('Share link copied to clipboard', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${activeRoute.id}`);
    }
  };

  const enableNotifications = async () => {
    const ok = await requestNotificationPermission();
    setNotifPerm(notificationStatus());
    toast(
      ok ? 'Notifications enabled for favorites' : 'Notifications not granted',
      ok ? 'success' : 'info'
    );
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'stops' | 'settings'>(
    'overview'
  );
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editRouteData, setEditRouteData] = useState({
    name: '',
    description: '',
    busNumber: '',
    busModel: '',
  });

  const [isEditingStops, setIsEditingStops] = useState(false);
  const [stopsHistory, setStopsHistory] = useState<RouteStop[][]>([]);
  const [stopsHistoryIndex, setStopsHistoryIndex] = useState(-1);
  const [newStopPrompt, setNewStopPrompt] = useState<{
    isOpen: boolean;
    lat: number;
    lng: number;
    name: string;
    arrivalTime: string;
  } | null>(null);

  useEffect(() => {
    if (activeRoute) {
      setEditRouteData({
        name: activeRoute.name || '',
        description: activeRoute.description || '',
        busNumber: activeRoute.busDetails?.numberPlate || '',
        busModel: activeRoute.busDetails?.model || '',
      });
      setStopsHistory([activeRoute.stops || []]);
      setStopsHistoryIndex(0);
      setIsEditingStops(false);
    }
  }, [activeRoute?.id]);

  const formatLocalTime = (date: Date) =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  const onMapClick = (lat: number, lng: number) => {
    if (!isEditingStops || !activeRoute) return;
    const currentStops = stopsHistory[stopsHistoryIndex] || [];
    const stopIndex = currentStops.length;
    const suggestedName = stopIndex === 0 ? 'Start' : `Stop ${stopIndex + 1}`;
    const suggestedTime = formatLocalTime(new Date(Date.now() + (stopIndex + 1) * 5 * 60_000));
    setNewStopPrompt({ isOpen: true, lat, lng, name: suggestedName, arrivalTime: suggestedTime });
  };

  const handleAddStopSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStopPrompt) return;
    const trimmedName = newStopPrompt.name.trim();
    if (!trimmedName) return;
    const newStop: RouteStop = {
      id: Math.random().toString(36).substring(2, 9),
      name: trimmedName,
      lat: newStopPrompt.lat,
      lng: newStopPrompt.lng,
      arrivalTime: newStopPrompt.arrivalTime || '--:--',
    };
    const currentStops = stopsHistory[stopsHistoryIndex] || [];
    const newStops = [...currentStops, newStop];
    const newHistory = stopsHistory.slice(0, stopsHistoryIndex + 1);
    newHistory.push(newStops);
    setStopsHistory(newHistory);
    setStopsHistoryIndex(newHistory.length - 1);
    setNewStopPrompt(null);
  };

  useEffect(() => {
    if (!newStopPrompt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNewStopPrompt(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newStopPrompt]);

  const onStopDragEnd = (routeId: string, stopId: string, lat: number, lng: number) => {
    if (!isEditingStops || activeRoute?.id !== routeId) return;
    const currentStops = stopsHistory[stopsHistoryIndex] || [];
    const newStops = currentStops.map((s) =>
      s.id === stopId ? { ...s, lat, lng } : s
    );
    const newHistory = stopsHistory.slice(0, stopsHistoryIndex + 1);
    newHistory.push(newStops);
    setStopsHistory(newHistory);
    setStopsHistoryIndex(newHistory.length - 1);
  };

  const saveStops = async () => {
    if (!activeRoute) return;
    setIsUpdating(true);
    try {
      const currentStops = stopsHistory[stopsHistoryIndex] || [];
      await updateDoc(doc(db, 'routes', activeRoute.id), {
        stops: currentStops,
        lastUpdated: new Date().toISOString(),
      });
      setIsEditingStops(false);
      setActiveRoute({ ...activeRoute, stops: currentStops });
      toast('Stops saved', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${activeRoute.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const undoStops = () => {
    if (stopsHistoryIndex > 0) setStopsHistoryIndex(stopsHistoryIndex - 1);
  };
  const redoStops = () => {
    if (stopsHistoryIndex < stopsHistory.length - 1)
      setStopsHistoryIndex(stopsHistoryIndex + 1);
  };

  const updateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoute) return;
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'routes', activeRoute.id), {
        name: editRouteData.name,
        description: editRouteData.description,
        'busDetails.numberPlate': editRouteData.busNumber,
        'busDetails.model': editRouteData.busModel,
        lastUpdated: new Date().toISOString(),
      });
      setIsEditingRoute(false);
      toast('Route updated', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${activeRoute.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteRoute = async () => {
    if (!activeRoute) return;
    setIsUpdating(true);
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'routes', activeRoute.id));
      setActiveRoute(null);
      setShowDeleteConfirm(false);
      toast('Route deleted', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `routes/${activeRoute.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const chartData = useMemo(() => {
    const history = activeRoute?.history;
    if (!history || history.length < 2) return [];
    const recent = history.slice(-30);
    let cumKm = 0;
    return recent.map((h, i) => {
      if (i > 0) {
        const prev = recent[i - 1];
        cumKm += haversineKm(prev.lat, prev.lng, h.lat, h.lng);
        const minutes =
          (new Date(h.updatedAt).getTime() - new Date(prev.updatedAt).getTime()) / 60000;
        const segKm = haversineKm(prev.lat, prev.lng, h.lat, h.lng);
        const speed = minutes > 0 ? (segKm / minutes) * 60 : 0;
        return {
          time: new Date(h.updatedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          distance: Number(cumKm.toFixed(2)),
          speed: Number(speed.toFixed(1)),
        };
      }
      return {
        time: new Date(h.updatedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        distance: 0,
        speed: 0,
      };
    });
  }, [activeRoute?.history]);

  const favoriteRoutes = useMemo(
    () => routes.filter((r) => favorites.includes(r.id)),
    [routes, favorites]
  );

  if (loading) return <Spinner />;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-blue-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200 dark:shadow-blue-900/40">
            <Bus size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-2">RouteLive</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8">
            Real-time transit tracking for daily commuters. Live ETA, offline-ready, and free forever.
          </p>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google"
              className="w-5 h-5"
            />
            Continue with Google
          </button>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-6 uppercase tracking-wider font-bold">
            Free · Open-source · Offline-capable
          </p>
        </div>
      </div>
    );
  }

  const routeIsFav = activeRoute ? isFavorite(activeRoute.id) : false;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans text-slate-900 dark:text-slate-100">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 transform ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:relative lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg shadow-md shadow-blue-100 dark:shadow-blue-900/40">
                <Bus size={20} className="text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
                RouteLive
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-2 text-slate-400 hover:text-slate-600"
              >
                <ChevronRight className="rotate-180" />
              </button>
            </div>
          </div>

          <nav className="p-4 space-y-1">
            <button
              onClick={() => setView('map')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                view === 'map'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <MapIcon size={20} />
              Live Map
            </button>
            <button
              onClick={() => setView('institute')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                view === 'institute'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <ShieldCheck size={20} />
              Institute Panel
            </button>
          </nav>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {view === 'map' ? (
              <>
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Search & Filters
                  </h3>
                  <button
                    onClick={() => setShowTraffic(!showTraffic)}
                    className={`text-[10px] px-2 py-1 rounded-full font-bold transition-all ${
                      showTraffic
                        ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    Traffic {showTraffic ? 'ON' : 'OFF'}
                  </button>
                </div>
                <Search onSearch={handleSearch} />

                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                  {(['all', 'favorites', 'public', 'private'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`px-2.5 py-1 rounded-full transition-all ${
                        filterType === t
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {t === 'favorites' ? '★ Faves' : t}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2">
                    Your Tracking
                  </h3>
                  <TrackingToggle
                    activeRoute={activeRoute}
                    onToggle={(isActive) => {
                      if (activeRoute) setActiveRoute({ ...activeRoute, isActive });
                    }}
                    isPinpointing={isPinpointing}
                    setIsPinpointing={setIsPinpointing}
                  />

                  {showNewRouteForm ? (
                    <form
                      onSubmit={createPublicRoute}
                      className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in zoom-in duration-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          New Route Details
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowNewRouteForm(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="Route Name"
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg outline-none"
                        value={newRouteData.name}
                        onChange={(e) =>
                          setNewRouteData({ ...newRouteData, name: e.target.value })
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Bus Number"
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg"
                          value={newRouteData.busNumber}
                          onChange={(e) =>
                            setNewRouteData({ ...newRouteData, busNumber: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          placeholder="Bus Model"
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg"
                          value={newRouteData.busModel}
                          onChange={(e) =>
                            setNewRouteData({ ...newRouteData, busModel: e.target.value })
                          }
                        />
                      </div>
                      <textarea
                        placeholder="Description"
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg h-20"
                        value={newRouteData.description}
                        onChange={(e) =>
                          setNewRouteData({ ...newRouteData, description: e.target.value })
                        }
                      />
                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="w-full py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50"
                      >
                        {isUpdating ? 'Creating...' : 'Start Tracking Now'}
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setShowNewRouteForm(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-all text-sm font-medium"
                    >
                      <Plus size={18} />
                      Create New Route
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Routes ({filteredRoutes.length})
                    </h3>
                    {notifPerm !== 'granted' && notifPerm !== 'unsupported' && favoriteRoutes.length > 0 && (
                      <button
                        onClick={enableNotifications}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-bold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
                      >
                        <Bell size={10} /> Enable alerts
                      </button>
                    )}
                    {notifPerm === 'granted' && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-bold bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400">
                        <Bell size={10} /> Alerts on
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {filteredRoutes.length === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-4 text-center">
                        No routes match your filter.
                      </p>
                    )}
                    {filteredRoutes.map((route, index) => {
                      const colors = [
                        '#3b82f6',
                        '#ef4444',
                        '#10b981',
                        '#f59e0b',
                        '#8b5cf6',
                        '#ec4899',
                        '#06b6d4',
                        '#f97316',
                      ];
                      const routeColor = colors[index % colors.length];
                      const fav = isFavorite(route.id);
                      return (
                        <div
                          key={route.id}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                            activeRoute?.id === route.id
                              ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 shadow-sm'
                              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                          }`}
                        >
                          <button
                            onClick={() => setActiveRoute(route)}
                            className="flex items-center gap-3 flex-1 text-left min-w-0"
                          >
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors text-white shrink-0"
                              style={{
                                backgroundColor:
                                  activeRoute?.id === route.id ? routeColor : '#94a3b8',
                              }}
                            >
                              <Bus size={20} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                  {route.name}
                                </p>
                                {route.isActive && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">
                                {route.type} • {route.busDetails?.numberPlate || 'No Plate'}
                              </p>
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(route.id);
                              toast(
                                fav ? 'Removed from favorites' : 'Added to favorites',
                                'info'
                              );
                            }}
                            className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                              fav
                                ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950'
                                : 'text-slate-300 dark:text-slate-600 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                            aria-label={fav ? 'Unfavorite' : 'Favorite'}
                          >
                            <Star size={16} fill={fav ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <InstitutePanel />
            )}
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl">
              <div className="flex items-center gap-3 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || ''}
                    className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-900 shadow-sm shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <UserIcon size={20} />
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                    {user.displayName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 relative flex">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className={`absolute top-4 left-4 z-40 p-3 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 lg:hidden transition-opacity ${
            isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <SearchIcon size={20} />
        </button>
        <div className="flex-1 h-full relative">
          <Map
            routes={filteredRoutes.map((r) =>
              r.id === activeRoute?.id && isEditingStops
                ? { ...r, stops: stopsHistory[stopsHistoryIndex] || [] }
                : r
            )}
            userLocation={userLocation}
            selectedRouteId={activeRoute?.id}
            onMarkerClick={(route) => setActiveRoute(route)}
            isPinpointing={isPinpointing}
            onPinpoint={onPinpoint}
            manualPin={manualPin}
            showTraffic={showTraffic}
            isEditingStops={isEditingStops}
            onStopDragEnd={onStopDragEnd}
            onMapClick={onMapClick}
            draftStopLocation={
              newStopPrompt ? [newStopPrompt.lat, newStopPrompt.lng] : null
            }
          />
          {userLocation && (
            <button
              onClick={() => {
                // Trigger re-center by toggling active route to force MapUpdater
                toast('Centered on your location', 'info');
              }}
              className="absolute bottom-6 right-6 z-[1000] p-3 bg-white dark:bg-slate-800 rounded-full shadow-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors"
              aria-label="Center map"
            >
              <Navigation2 size={18} />
            </button>
          )}
          {isUpdating && (
            <div className="absolute top-4 right-4 z-[1000] bg-white/80 dark:bg-slate-800/80 backdrop-blur px-4 py-2 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Updating...
            </div>
          )}

          {isEditingStops && !newStopPrompt && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 pointer-events-none">
              <MapIcon size={14} />
              {(stopsHistory[stopsHistoryIndex]?.length ?? 0) === 0
                ? 'Tap the map to drop your start stop'
                : `Tap to add stop ${(stopsHistory[stopsHistoryIndex]?.length ?? 0) + 1} · drag any pin to adjust`}
            </div>
          )}

          {newStopPrompt && newStopPrompt.isOpen && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[2000] w-[min(92vw,360px)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      (stopsHistory[stopsHistoryIndex]?.length ?? 0) === 0
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    }`}
                  >
                    {(stopsHistory[stopsHistoryIndex]?.length ?? 0) === 0
                      ? 'Start'
                      : `Stop ${(stopsHistory[stopsHistoryIndex]?.length ?? 0) + 1}`}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {newStopPrompt.lat.toFixed(4)}, {newStopPrompt.lng.toFixed(4)}
                  </span>
                </div>
                <button
                  onClick={() => setNewStopPrompt(null)}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label="Cancel"
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleAddStopSubmit} className="p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder="Stop name"
                    className="flex-1 min-w-0 px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                    value={newStopPrompt.name}
                    onChange={(e) =>
                      setNewStopPrompt({ ...newStopPrompt, name: e.target.value })
                    }
                  />
                  <input
                    type="time"
                    className="w-28 px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                    value={newStopPrompt.arrivalTime}
                    onChange={(e) =>
                      setNewStopPrompt({ ...newStopPrompt, arrivalTime: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Press Enter to save · Esc to cancel
                  </span>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-semibold text-xs hover:bg-blue-700 transition-colors"
                  >
                    Add stop
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {activeRoute && (
          <div className="w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col hidden xl:flex animate-in slide-in-from-right duration-300">
            <div className="p-6 pb-0 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Route Details</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleFavorite(activeRoute.id)}
                    className={`p-2 transition-colors ${
                      routeIsFav
                        ? 'text-amber-500'
                        : 'text-slate-400 hover:text-amber-500'
                    }`}
                    title={routeIsFav ? 'Remove favorite' : 'Add to favorites'}
                  >
                    <Star size={20} fill={routeIsFav ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={generateShareLink}
                    className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                    title="Share Route"
                  >
                    <Share2 size={20} />
                  </button>
                  <button
                    onClick={() => setActiveRoute(null)}
                    className="p-2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex gap-6 border-b border-slate-200 dark:border-slate-800">
                {(['overview', 'history', 'stops', ...(activeRoute.driverId === user?.uid ? ['settings' as const] : [])] as const).map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`pb-3 text-sm font-semibold transition-colors relative capitalize ${
                        activeTab === tab
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab}
                      {activeTab === tab && (
                        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
                      )}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-900">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                        <Bus size={24} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                          {activeRoute.name}
                        </h3>
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                          {activeRoute.type} Route
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                      {activeRoute.description || 'No description provided.'}
                    </p>
                    {activeRoute.busDetails && (activeRoute.busDetails.numberPlate || activeRoute.busDetails.model) && (
                      <div className="flex flex-wrap gap-2">
                        {activeRoute.busDetails.numberPlate && (
                          <span className="px-2 py-1 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900 rounded text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                            {activeRoute.busDetails.numberPlate}
                          </span>
                        )}
                        {activeRoute.busDetails.model && (
                          <span className="px-2 py-1 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900 rounded text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                            {activeRoute.busDetails.model}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-slate-900 dark:bg-slate-800 rounded-2xl text-white shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Clock size={18} className="text-blue-400" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Estimated Arrival
                        </span>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          activeRoute.isActive
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {activeRoute.isActive ? 'Live' : 'Offline'}
                      </span>
                    </div>
                    <div className="flex items-end gap-2">
                      <p className="text-4xl font-bold">
                        {activeRoute.eta?.arrivalTime || '—'}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            activeRoute.eta?.trafficStatus === 'high'
                              ? 'bg-red-500'
                              : activeRoute.eta?.trafficStatus === 'low'
                                ? 'bg-green-500'
                                : 'bg-amber-500'
                          }`}
                        />
                        <span className="text-slate-400 uppercase font-bold tracking-tighter">
                          Traffic: {activeRoute.eta?.trafficStatus || 'unknown'} (est.)
                        </span>
                      </div>
                      <span className="text-blue-400 font-bold">
                        {activeRoute.eta?.remainingMinutes ?? '—'} mins away
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-6">
                  <div className="p-4 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        Distance Traveled
                      </h4>
                      <Activity size={14} className="text-slate-300 dark:text-slate-600" />
                    </div>
                    <div className="h-40 w-full">
                      {chartData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="distFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                            <XAxis dataKey="time" hide />
                            <YAxis hide />
                            <Tooltip
                              contentStyle={{
                                borderRadius: '12px',
                                border: 'none',
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                background: theme === 'dark' ? '#1e293b' : '#ffffff',
                                color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                              }}
                              labelStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                              formatter={(v: number, name: string) => [
                                name === 'distance' ? `${v} km` : `${v} km/h`,
                                name,
                              ]}
                            />
                            <Area
                              type="monotone"
                              dataKey="distance"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              fill="url(#distFill)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-slate-400">
                          Need more data points
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      Speed (km/h)
                    </h4>
                    <div className="h-32 w-full">
                      {chartData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                            <XAxis dataKey="time" hide />
                            <YAxis hide />
                            <Tooltip
                              contentStyle={{
                                borderRadius: '12px',
                                border: 'none',
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                background: theme === 'dark' ? '#1e293b' : '#ffffff',
                                color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="speed"
                              stroke="#10b981"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-slate-400">
                          Need more data points
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <TrendingUp size={14} />
                        <span className="text-[10px] font-bold uppercase">Points</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900 dark:text-slate-50">
                        {activeRoute.history?.length || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <Clock size={14} />
                        <span className="text-[10px] font-bold uppercase">Avg Speed</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900 dark:text-slate-50">
                        {chartData.length > 0
                          ? (
                              chartData.reduce((s, d) => s + d.speed, 0) /
                              Math.max(1, chartData.length)
                            ).toFixed(1)
                          : 0}{' '}
                        <span className="text-xs font-medium text-slate-400">km/h</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'stops' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Route Stops</h3>
                    {activeRoute.driverId === user?.uid && (
                      <button
                        onClick={() => setIsEditingStops(!isEditingStops)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          isEditingStops
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {isEditingStops ? 'Done Editing' : 'Edit Stops'}
                      </button>
                    )}
                  </div>

                  {isEditingStops && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-xl space-y-3">
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        <strong>Click anywhere on the map</strong> to drop a new stop.{' '}
                        <strong>Drag</strong> existing stops to move them. The route will
                        automatically connect them.
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          <button
                            onClick={undoStops}
                            disabled={stopsHistoryIndex <= 0}
                            className="px-2 py-1 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded text-xs font-bold text-blue-600 dark:text-blue-400 disabled:opacity-50"
                          >
                            Undo
                          </button>
                          <button
                            onClick={redoStops}
                            disabled={stopsHistoryIndex >= stopsHistory.length - 1}
                            className="px-2 py-1 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded text-xs font-bold text-blue-600 dark:text-blue-400 disabled:opacity-50"
                          >
                            Redo
                          </button>
                        </div>
                        <button
                          onClick={saveStops}
                          disabled={isUpdating}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {((isEditingStops ? stopsHistory[stopsHistoryIndex] : activeRoute.stops) ||
                      []).length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                        No stops added yet.
                      </p>
                    ) : (
                      ((isEditingStops
                        ? stopsHistory[stopsHistoryIndex]
                        : activeRoute.stops) || []).map((stop, index) => (
                        <div
                          key={stop.id}
                          className="flex items-center gap-4 p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-sm"
                        >
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-bold text-sm">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
                              {stop.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              ETA: {stop.arrivalTime}
                            </p>
                          </div>
                          {isEditingStops && (
                            <button
                              onClick={() => {
                                const newStops = stopsHistory[stopsHistoryIndex].filter(
                                  (s) => s.id !== stop.id
                                );
                                const newHistory = stopsHistory.slice(
                                  0,
                                  stopsHistoryIndex + 1
                                );
                                newHistory.push(newStops);
                                setStopsHistory(newHistory);
                                setStopsHistoryIndex(newHistory.length - 1);
                              }}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'settings' && activeRoute.driverId === user?.uid && (
                <div className="space-y-6">
                  <form onSubmit={updateRoute} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Route Name
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg outline-none focus:border-blue-500"
                        value={editRouteData.name}
                        onChange={(e) =>
                          setEditRouteData({ ...editRouteData, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Bus Number
                        </label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg outline-none focus:border-blue-500"
                          value={editRouteData.busNumber}
                          onChange={(e) =>
                            setEditRouteData({ ...editRouteData, busNumber: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Bus Model
                        </label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg outline-none focus:border-blue-500"
                          value={editRouteData.busModel}
                          onChange={(e) =>
                            setEditRouteData({ ...editRouteData, busModel: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Description
                      </label>
                      <textarea
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg outline-none focus:border-blue-500 h-24"
                        value={editRouteData.description}
                        onChange={(e) =>
                          setEditRouteData({ ...editRouteData, description: e.target.value })
                        }
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50"
                    >
                      {isUpdating ? 'Saving...' : 'Save Changes'}
                    </button>
                  </form>

                  <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-sm font-bold text-red-600 mb-2">Danger Zone</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      Once you delete a route, there is no going back. Please be certain.
                    </p>
                    {showDeleteConfirm ? (
                      <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl space-y-3 animate-in fade-in zoom-in duration-200">
                        <p className="text-sm font-bold text-red-800 dark:text-red-200">
                          Are you absolutely sure?
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400">
                          This action cannot be undone. This will permanently delete the route and
                          all its data.
                        </p>
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={isUpdating}
                            className="flex-1 py-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={deleteRoute}
                            disabled={isUpdating}
                            className="flex-1 py-2 bg-red-600 text-white rounded-lg font-semibold text-xs hover:bg-red-700 transition-all disabled:opacity-50"
                          >
                            {isUpdating ? 'Deleting...' : 'Yes, Delete'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isUpdating}
                        className="w-full py-2.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-xl font-semibold text-sm hover:bg-red-100 dark:hover:bg-red-950/60 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <AlertTriangle size={16} />
                        Delete Route
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Routes>
            <RouterRoute path="/share/:routeId" element={<ShareView />} />
            <RouterRoute path="*" element={<MainApp />} />
          </Routes>
        </Router>
      </AppProvider>
    </ErrorBoundary>
  );
}
