import React, { useState, useEffect, useMemo } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route as RouterRoute, 
  useParams, 
  useNavigate 
} from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { 
  Bus, 
  Search as SearchIcon, 
  Navigation, 
  Settings, 
  LogOut, 
  User as UserIcon,
  Plus,
  ChevronRight,
  ShieldCheck,
  Map as MapIcon,
  Info,
  Users,
  Clock,
  Calendar,
  TrendingUp,
  History,
  X,
  Share2,
  AlertTriangle,
  Activity,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import Map from './components/Map';
import Search from './components/Search';
import TrackingToggle from './components/TrackingToggle';
import InstitutePanel from './components/InstitutePanel';
import { Route, UserProfile } from './types';

// Helper to calculate distance between two points in km
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

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

  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-50"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!route) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500 font-bold">Route not found or link expired.</div>;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white"><Bus size={20} /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{route.name}</h1>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Shared Live View</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${route.isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
          <span className="text-xs font-bold text-slate-500 uppercase">{route.isActive ? 'Live' : 'Offline'}</span>
        </div>
      </div>
      <div className="flex-1 relative">
        <Map routes={[route]} selectedRouteId={route.id} showTraffic={true} />
        <div className="absolute bottom-6 left-6 right-6 lg:left-auto lg:right-6 lg:w-96 z-[1000] bg-white p-6 rounded-3xl shadow-2xl border border-slate-100 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Bus size={24} /></div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{route.name}</h3>
              <p className="text-xs text-slate-500">{route.busDetails?.numberPlate || 'No Plate'}</p>
            </div>
          </div>
          <div className="p-4 bg-slate-900 rounded-2xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase text-slate-400">Estimated Arrival</span>
              <span className="text-[10px] font-bold uppercase text-blue-400">Live</span>
            </div>
            <p className="text-3xl font-bold">{route.eta?.arrivalTime || '08:45 AM'}</p>
            <div className="mt-2 flex items-center justify-between text-[10px]">
              <span className="text-slate-400 uppercase">Traffic: {route.eta?.trafficStatus || 'Moderate'}</span>
              <span className="text-blue-400 font-bold">{route.eta?.remainingMinutes || 12} mins away</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>();
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [view, setView] = useState<'map' | 'institute'>('map');
  const [loading, setLoading] = useState(true);
  const [isPinpointing, setIsPinpointing] = useState(false);
  const [manualPin, setManualPin] = useState<[number, number] | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showTraffic, setShowTraffic] = useState(true);
  
  const [showNewRouteForm, setShowNewRouteForm] = useState(false);
  const [newRouteData, setNewRouteData] = useState({
    name: '',
    description: '',
    busNumber: '',
    busModel: ''
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
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
      setFilteredRoutes([]);
      return;
    }

    const q = query(collection(db, 'routes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedRoutes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route));
      setRoutes(fetchedRoutes);
      setFilteredRoutes(fetchedRoutes);
      
      if (activeRoute) {
        const updated = fetchedRoutes.find(r => r.id === activeRoute.id);
        if (updated) setActiveRoute(updated);
      }
    }, (error) => {
      if (auth.currentUser) handleFirestoreError(error, OperationType.LIST, 'routes');
    });

    return () => unsubscribe();
  }, [user, activeRoute?.id]);

  // Filter Logic
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    let filtered = routes;
    if (filterType !== 'all') filtered = filtered.filter(r => r.type === filterType);
    if (filterStatus !== 'all') filtered = filtered.filter(r => r.status === filterStatus);
    setFilteredRoutes(filtered);
  }, [routes, filterType, filterStatus]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => console.error(error),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // ETA Calculation Logic
  useEffect(() => {
    if (!activeRoute?.currentLocation || !activeRoute.isActive) return;

    const calculateETA = async () => {
      const current = activeRoute.currentLocation!;
      let destLat = current.lat + 0.05;
      let destLng = current.lng + 0.05;

      // If there are stops, find the next stop (using the first stop for simplicity in this demo)
      if (activeRoute.stops && activeRoute.stops.length > 0) {
        destLat = activeRoute.stops[0].lat;
        destLng = activeRoute.stops[0].lng;
      }

      try {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${current.lng},${current.lat};${destLng},${destLat}?overview=false`);
        if (!response.ok) {
          throw new Error(`OSRM returned ${response.status}`);
        }
        const data = await response.json();
        
        if (data.routes && data.routes[0]) {
          const durationSeconds = data.routes[0].duration;
          
          // Simulate traffic multiplier based on time of day or random (since OSRM doesn't have real-time traffic)
          const trafficMultiplier = showTraffic ? (Math.random() * 0.5 + 1) : 1; // 1x to 1.5x
          const remainingMinutes = Math.round((durationSeconds * trafficMultiplier) / 60);
          
          const arrivalTime = new Date(Date.now() + remainingMinutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const trafficStatus = trafficMultiplier > 1.3 ? 'high' : (trafficMultiplier > 1.1 ? 'moderate' : 'low');

          if (!activeRoute.eta || Math.abs(activeRoute.eta.remainingMinutes - remainingMinutes) > 2) {
            await updateDoc(doc(db, 'routes', activeRoute.id), {
              eta: {
                arrivalTime,
                remainingMinutes,
                trafficStatus
              }
            });
          }
          return; // Success, exit function
        }
      } catch (e) {
        console.error("OSRM ETA calculation failed, falling back to straight-line distance", e);
      }

      // Fallback if OSRM fails
      try {
        const distance = getDistance(current.lat, current.lng, destLat, destLng);
        const avgSpeed = 30; // 30 km/h
        const remainingMinutes = Math.round((distance / avgSpeed) * 60);
        
        const arrivalTime = new Date(Date.now() + remainingMinutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (!activeRoute.eta || Math.abs(activeRoute.eta.remainingMinutes - remainingMinutes) > 2) {
          await updateDoc(doc(db, 'routes', activeRoute.id), {
            eta: {
              arrivalTime,
              remainingMinutes,
              trafficStatus: showTraffic ? (remainingMinutes > 15 ? 'high' : 'moderate') : 'low'
            }
          });
        }
      } catch (e) {
        console.error("Fallback ETA update failed", e);
      }
    };

    const interval = setInterval(calculateETA, 30000); // Every 30s
    calculateETA(); // Call immediately on mount/change
    return () => clearInterval(interval);
  }, [activeRoute?.id, activeRoute?.currentLocation, showTraffic]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSearch = (query: string) => {
    if (!query) {
      setFilteredRoutes(routes);
      return;
    }
    const lowerQuery = query.toLowerCase();
    setFilteredRoutes(routes.filter(r => 
      r.name.toLowerCase().includes(lowerQuery) || 
      r.description?.toLowerCase().includes(lowerQuery) ||
      r.busDetails?.numberPlate?.toLowerCase().includes(lowerQuery)
    ));
  };

  const onPinpoint = async (lat: number, lng: number) => {
    if (!activeRoute) return;
    setManualPin([lat, lng]);
    setIsUpdating(true);
    const now = new Date().toISOString();
    
    try {
      await updateDoc(doc(db, 'routes', activeRoute.id), {
        currentLocation: {
          lat,
          lng,
          updatedAt: now,
        },
        history: arrayUnion({
          lat,
          lng,
          updatedAt: now,
        }),
        lastUpdated: now,
        isActive: true
      });
      setIsPinpointing(false);
      setManualPin(null);
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
          model: newRouteData.busModel
        },
        type: 'public',
        status: 'active',
        driverId: user.uid,
        isActive: true,
        lastUpdated: new Date().toISOString(),
        stops: [],
        analytics: {
          averageTimeMinutes: 45,
          todayTime: '08:30 AM',
          tomorrowExpectedTime: '08:35 AM'
        }
      };
      const docRef = await addDoc(collection(db, 'routes'), newRoute);
      setActiveRoute({ id: docRef.id, ...newRoute } as Route);
      setShowNewRouteForm(false);
      setNewRouteData({ name: '', description: '', busNumber: '', busModel: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'routes');
    } finally {
      setIsUpdating(false);
    }
  };

  const generateShareLink = async () => {
    if (!activeRoute) return;
    const link = `${window.location.origin}/share/${activeRoute.id}`;
    try {
      await updateDoc(doc(db, 'routes', activeRoute.id), { shareableLink: link });
      navigator.clipboard.writeText(link);
      alert("Shareable link copied to clipboard!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${activeRoute.id}`);
    }
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'stops' | 'settings'>('overview');
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editRouteData, setEditRouteData] = useState({
    name: '',
    description: '',
    busNumber: '',
    busModel: ''
  });

  const [isEditingStops, setIsEditingStops] = useState(false);
  const [stopsHistory, setStopsHistory] = useState<RouteStop[][]>([]);
  const [stopsHistoryIndex, setStopsHistoryIndex] = useState(-1);
  const [newStopPrompt, setNewStopPrompt] = useState<{ isOpen: boolean, lat: number, lng: number, name: string, arrivalTime: string } | null>(null);

  useEffect(() => {
    if (activeRoute) {
      setEditRouteData({
        name: activeRoute.name || '',
        description: activeRoute.description || '',
        busNumber: activeRoute.busDetails?.numberPlate || '',
        busModel: activeRoute.busDetails?.model || ''
      });
      setStopsHistory([activeRoute.stops || []]);
      setStopsHistoryIndex(0);
      setIsEditingStops(false);
    }
  }, [activeRoute?.id]);

  const onMapClick = (lat: number, lng: number) => {
    if (!isEditingStops || !activeRoute) return;
    setNewStopPrompt({ isOpen: true, lat, lng, name: '', arrivalTime: '' });
  };

  const handleAddStopSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStopPrompt || !newStopPrompt.name) return;

    const newStop: RouteStop = {
      id: Math.random().toString(36).substring(2, 9),
      name: newStopPrompt.name,
      lat: newStopPrompt.lat,
      lng: newStopPrompt.lng,
      arrivalTime: newStopPrompt.arrivalTime || '--:--'
    };
    
    const currentStops = stopsHistory[stopsHistoryIndex] || [];
    const newStops = [...currentStops, newStop];
    
    const newHistory = stopsHistory.slice(0, stopsHistoryIndex + 1);
    newHistory.push(newStops);
    setStopsHistory(newHistory);
    setStopsHistoryIndex(newHistory.length - 1);
    setNewStopPrompt(null);
  };

  const onStopDragEnd = (routeId: string, stopId: string, lat: number, lng: number) => {
    if (!isEditingStops || activeRoute?.id !== routeId) return;
    
    const currentStops = stopsHistory[stopsHistoryIndex] || [];
    const newStops = currentStops.map(s => s.id === stopId ? { ...s, lat, lng } : s);
    
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
        lastUpdated: new Date().toISOString()
      });
      setIsEditingStops(false);
      // Update local active route state so it reflects immediately
      setActiveRoute({ ...activeRoute, stops: currentStops });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${activeRoute.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const undoStops = () => {
    if (stopsHistoryIndex > 0) {
      setStopsHistoryIndex(stopsHistoryIndex - 1);
    }
  };

  const redoStops = () => {
    if (stopsHistoryIndex < stopsHistory.length - 1) {
      setStopsHistoryIndex(stopsHistoryIndex + 1);
    }
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
        lastUpdated: new Date().toISOString()
      });
      setIsEditingRoute(false);
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
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `routes/${activeRoute.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const chartData = useMemo(() => {
    if (!activeRoute?.history) return [];
    return activeRoute.history.slice(-20).map(h => ({
      time: new Date(h.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      lat: h.lat,
      lng: h.lng
    }));
  }, [activeRoute?.history]);

  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-50"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <Bus size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">RouteLive</h1>
          <p className="text-slate-500 mb-8">Real-time transit tracking for everyone. Secure, private, and professional.</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <aside className={`fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-slate-200 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg shadow-md shadow-blue-100"><Bus size={20} className="text-white" /></div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">RouteLive</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-slate-600"><ChevronRight className="rotate-180" /></button>
          </div>

          <nav className="p-4 space-y-1">
            <button onClick={() => setView('map')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${view === 'map' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}><MapIcon size={20} />Live Map</button>
            <button onClick={() => setView('institute')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${view === 'institute' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}><ShieldCheck size={20} />Institute Panel</button>
          </nav>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {view === 'map' ? (
              <>
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Search & Filters</h3>
                  <button onClick={() => setShowTraffic(!showTraffic)} className={`text-[10px] px-2 py-1 rounded-full font-bold transition-all ${showTraffic ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>Traffic {showTraffic ? 'ON' : 'OFF'}</button>
                </div>
                <Search onSearch={handleSearch} />
                
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">Your Tracking</h3>
                  <TrackingToggle 
                    activeRoute={activeRoute} 
                    onToggle={(isActive) => { if (activeRoute) setActiveRoute({ ...activeRoute, isActive }); }}
                    isPinpointing={isPinpointing}
                    setIsPinpointing={setIsPinpointing}
                  />
                  
                  {showNewRouteForm ? (
                    <form onSubmit={createPublicRoute} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in zoom-in duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-bold text-slate-700">New Route Details</h4>
                        <button type="button" onClick={() => setShowNewRouteForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                      </div>
                      <input type="text" required placeholder="Route Name" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" value={newRouteData.name} onChange={e => setNewRouteData({...newRouteData, name: e.target.value})} />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Bus Number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={newRouteData.busNumber} onChange={e => setNewRouteData({...newRouteData, busNumber: e.target.value})} />
                        <input type="text" placeholder="Bus Model" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={newRouteData.busModel} onChange={e => setNewRouteData({...newRouteData, busModel: e.target.value})} />
                      </div>
                      <textarea placeholder="Description" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg h-20" value={newRouteData.description} onChange={e => setNewRouteData({...newRouteData, description: e.target.value})} />
                      <button type="submit" disabled={isUpdating} className="w-full py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50">{isUpdating ? 'Creating...' : 'Start Tracking Now'}</button>
                    </form>
                  ) : (
                    <button onClick={() => setShowNewRouteForm(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-all text-sm font-medium"><Plus size={18} />Create New Route</button>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">Active Routes ({filteredRoutes.length})</h3>
                  <div className="space-y-2">
                    {filteredRoutes.map((route, index) => {
                      const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
                      const routeColor = colors[index % colors.length];
                      return (
                        <button key={route.id} onClick={() => setActiveRoute(route)} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${activeRoute?.id === route.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors text-white`} style={{ backgroundColor: activeRoute?.id === route.id ? routeColor : '#94a3b8' }}><Bus size={20} /></div>
                            <div className="text-left">
                              <p className="text-sm font-semibold text-slate-800">{route.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{route.type} • {route.busDetails?.numberPlate || 'No Plate'}</p>
                            </div>
                          </div>
                          <ChevronRight size={16} className={activeRoute?.id === route.id ? 'text-blue-400' : 'text-slate-300'} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <InstitutePanel />
            )}
          </div>

          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
              <div className="flex items-center gap-3">
                {user.photoURL ? <img src={user.photoURL} alt={user.displayName || ''} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" /> : <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center"><UserIcon size={20} /></div>}
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-slate-900 truncate">{user.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 relative flex">
        <button onClick={() => setIsSidebarOpen(true)} className={`absolute top-4 left-4 z-40 p-3 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-600 lg:hidden transition-opacity ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}><SearchIcon size={20} /></button>
        <div className="flex-1 h-full relative">
          <Map 
            routes={filteredRoutes.map(r => r.id === activeRoute?.id && isEditingStops ? { ...r, stops: stopsHistory[stopsHistoryIndex] || [] } : r)} 
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
          />
          {isUpdating && <div className="absolute top-4 right-4 z-[1000] bg-white/80 backdrop-blur px-4 py-2 rounded-full shadow-sm border border-slate-200 flex items-center gap-2 text-xs font-medium text-slate-600"><div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />Updating...</div>}
          
          {newStopPrompt && newStopPrompt.isOpen && (
            <div className="absolute inset-0 z-[2000] bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <h3 className="font-bold text-slate-900">Add New Stop</h3>
                  <button onClick={() => setNewStopPrompt(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <form onSubmit={handleAddStopSubmit} className="p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stop Name</label>
                    <input 
                      type="text" 
                      autoFocus
                      required 
                      placeholder="e.g., Central Station" 
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      value={newStopPrompt.name} 
                      onChange={e => setNewStopPrompt({...newStopPrompt, name: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Estimated Arrival (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="e.g., 08:30 AM" 
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      value={newStopPrompt.arrivalTime} 
                      onChange={e => setNewStopPrompt({...newStopPrompt, arrivalTime: e.target.value})} 
                    />
                  </div>
                  <div className="pt-2 flex gap-2">
                    <button type="button" onClick={() => setNewStopPrompt(null)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">Cancel</button>
                    <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">Add Stop</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {activeRoute && (
          <div className="w-96 bg-white border-l border-slate-200 h-full flex flex-col hidden xl:flex animate-in slide-in-from-right duration-300">
            <div className="p-6 pb-0 border-b border-slate-100">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Route Details</h2>
                <div className="flex items-center gap-2">
                  <button onClick={generateShareLink} className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Share Route"><Share2 size={20} /></button>
                  <button onClick={() => setActiveRoute(null)} className="p-2 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
              </div>
              <div className="flex gap-6 border-b border-slate-200">
                <button onClick={() => setActiveTab('overview')} className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'overview' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                  Overview
                  {activeTab === 'overview' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('history')} className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'history' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                  History
                  {activeTab === 'history' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('stops')} className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'stops' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                  Stops
                  {activeTab === 'stops' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                </button>
                {activeRoute.driverId === user?.uid && (
                  <button onClick={() => setActiveTab('settings')} className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'settings' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                    Settings
                    {activeTab === 'settings' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Bus size={24} /></div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{activeRoute.name}</h3>
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{activeRoute.type} Route</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-3">{activeRoute.description || 'No description provided.'}</p>
                    {activeRoute.busDetails && (
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-1 bg-white border border-blue-100 rounded text-[10px] font-bold text-blue-600 uppercase">{activeRoute.busDetails.numberPlate}</span>
                        <span className="px-2 py-1 bg-white border border-blue-100 rounded text-[10px] font-bold text-blue-600 uppercase">{activeRoute.busDetails.model}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-slate-900 rounded-2xl text-white shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2"><Clock size={18} className="text-blue-400" /><span className="text-xs font-bold uppercase tracking-wider">Estimated Arrival</span></div>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-[10px] font-bold uppercase">Live</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <p className="text-4xl font-bold">{activeRoute.eta?.arrivalTime || '08:45'}</p>
                      <p className="text-sm text-slate-400 mb-1">AM</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${activeRoute.eta?.trafficStatus === 'high' ? 'bg-red-500' : 'bg-green-500'}`} />
                        <span className="text-slate-400 uppercase font-bold tracking-tighter">Traffic: {activeRoute.eta?.trafficStatus || 'Moderate'}</span>
                      </div>
                      <span className="text-blue-400 font-bold">{activeRoute.eta?.remainingMinutes || 12} mins away</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-6">
                  <div className="p-4 border border-slate-100 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between"><h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Movement History</h4><Activity size={14} className="text-slate-300" /></div>
                    <div className="h-40 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="time" hide />
                          <YAxis hide domain={['auto', 'auto']} />
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} labelStyle={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b' }} />
                          <Line type="monotone" dataKey="lat" stroke="#3b82f6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="lng" stroke="#94a3b8" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 text-slate-400 mb-1"><TrendingUp size={14} /><span className="text-[10px] font-bold uppercase">Avg Time</span></div>
                      <p className="text-xl font-bold text-slate-900">{activeRoute.analytics?.averageTimeMinutes || 45}m</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 text-slate-400 mb-1"><Clock size={14} /><span className="text-[10px] font-bold uppercase">Today</span></div>
                      <p className="text-xl font-bold text-slate-900">{activeRoute.analytics?.todayTime || '08:30 AM'}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'stops' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Route Stops</h3>
                    {activeRoute.driverId === user?.uid && (
                      <button 
                        onClick={() => setIsEditingStops(!isEditingStops)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isEditingStops ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {isEditingStops ? 'Done Editing' : 'Edit Stops'}
                      </button>
                    )}
                  </div>
                  
                  {isEditingStops && (
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
                      <p className="text-xs text-blue-800">
                        <strong>Click anywhere on the map</strong> to drop a new stop. <strong>Drag</strong> existing stops to move them. The route will automatically connect them.
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          <button onClick={undoStops} disabled={stopsHistoryIndex <= 0} className="px-2 py-1 bg-white border border-blue-200 rounded text-xs font-bold text-blue-600 disabled:opacity-50">Undo</button>
                          <button onClick={redoStops} disabled={stopsHistoryIndex >= stopsHistory.length - 1} className="px-2 py-1 bg-white border border-blue-200 rounded text-xs font-bold text-blue-600 disabled:opacity-50">Redo</button>
                        </div>
                        <button onClick={saveStops} disabled={isUpdating} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-50">Save Changes</button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {((isEditingStops ? stopsHistory[stopsHistoryIndex] : activeRoute.stops) || []).length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-8">No stops added yet.</p>
                    ) : (
                      ((isEditingStops ? stopsHistory[stopsHistoryIndex] : activeRoute.stops) || []).map((stop, index) => (
                        <div key={stop.id} className="flex items-center gap-4 p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                          <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">{index + 1}</div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-900">{stop.name}</p>
                            <p className="text-xs text-slate-500">ETA: {stop.arrivalTime}</p>
                          </div>
                          {isEditingStops && (
                            <button 
                              onClick={() => {
                                const newStops = stopsHistory[stopsHistoryIndex].filter(s => s.id !== stop.id);
                                const newHistory = stopsHistory.slice(0, stopsHistoryIndex + 1);
                                newHistory.push(newStops);
                                setStopsHistory(newHistory);
                                setStopsHistoryIndex(newHistory.length - 1);
                              }}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Route Name</label>
                      <input type="text" required className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500" value={editRouteData.name} onChange={e => setEditRouteData({...editRouteData, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Bus Number</label>
                        <input type="text" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500" value={editRouteData.busNumber} onChange={e => setEditRouteData({...editRouteData, busNumber: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Bus Model</label>
                        <input type="text" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500" value={editRouteData.busModel} onChange={e => setEditRouteData({...editRouteData, busModel: e.target.value})} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                      <textarea className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 h-24" value={editRouteData.description} onChange={e => setEditRouteData({...editRouteData, description: e.target.value})} />
                    </div>
                    <button type="submit" disabled={isUpdating} className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50">
                      {isUpdating ? 'Saving...' : 'Save Changes'}
                    </button>
                  </form>

                  <div className="pt-6 border-t border-slate-100">
                    <h4 className="text-sm font-bold text-red-600 mb-2">Danger Zone</h4>
                    <p className="text-xs text-slate-500 mb-4">Once you delete a route, there is no going back. Please be certain.</p>
                    
                    {showDeleteConfirm ? (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3 animate-in fade-in zoom-in duration-200">
                        <p className="text-sm font-bold text-red-800">Are you absolutely sure?</p>
                        <p className="text-xs text-red-600">This action cannot be undone. This will permanently delete the route and all its data.</p>
                        <div className="flex gap-2 pt-2">
                          <button onClick={() => setShowDeleteConfirm(false)} disabled={isUpdating} className="flex-1 py-2 bg-white text-slate-600 border border-slate-200 rounded-lg font-semibold text-xs hover:bg-slate-50 transition-all disabled:opacity-50">
                            Cancel
                          </button>
                          <button onClick={deleteRoute} disabled={isUpdating} className="flex-1 py-2 bg-red-600 text-white rounded-lg font-semibold text-xs hover:bg-red-700 transition-all disabled:opacity-50">
                            {isUpdating ? 'Deleting...' : 'Yes, Delete'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowDeleteConfirm(true)} disabled={isUpdating} className="w-full py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl font-semibold text-sm hover:bg-red-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
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
    <Router>
      <Routes>
        <RouterRoute path="/share/:routeId" element={<ShareView />} />
        <RouterRoute path="*" element={<MainApp />} />
      </Routes>
    </Router>
  );
}
