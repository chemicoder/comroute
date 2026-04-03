import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline, LayerGroup } from 'react-leaflet';
import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Route } from '../types';
import { useEffect, useState } from 'react';

const BusIcon = (isSelected: boolean) => L.divIcon({
  className: 'custom-bus-icon',
  html: `<div class="w-10 h-10 ${isSelected ? 'bg-blue-700 scale-125 ring-4 ring-blue-200' : 'bg-blue-600'} rounded-full border-2 border-white flex items-center justify-center shadow-xl transition-all duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h10c0-1.1.9-2 2-2Z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
        </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const UserIcon = L.divIcon({
  className: 'custom-user-icon',
  html: `<div class="w-5 h-5 bg-red-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const PinIcon = L.divIcon({
  className: 'custom-pin-icon',
  html: `<div class="w-8 h-8 text-blue-600 flex items-center justify-center drop-shadow-md">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="white" stroke-width="1"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>
        </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const StopIcon = (color: string) => L.divIcon({
  className: 'custom-stop-icon',
  html: `<div class="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shadow-md" style="background-color: ${color};">
          <div class="w-2 h-2 bg-white rounded-full"></div>
        </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

function MapEvents({ onMapClick, isPinpointing, onPinpoint }: { onMapClick?: (lat: number, lng: number) => void, isPinpointing?: boolean, onPinpoint?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (isPinpointing && onPinpoint) {
        onPinpoint(e.latlng.lat, e.latlng.lng);
      } else if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

interface MapProps {
  routes: Route[];
  userLocation?: [number, number];
  selectedRouteId?: string;
  onMarkerClick?: (route: Route) => void;
  isPinpointing?: boolean;
  onPinpoint?: (lat: number, lng: number) => void;
  manualPin?: [number, number] | null;
  showTraffic?: boolean;
  isEditingStops?: boolean;
  onStopDragEnd?: (routeId: string, stopId: string, lat: number, lng: number) => void;
  onPolylineClick?: (routeId: string, lat: number, lng: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
}

export default function Map({ 
  routes, 
  userLocation, 
  selectedRouteId, 
  onMarkerClick, 
  isPinpointing, 
  onPinpoint,
  manualPin,
  showTraffic = true,
  isEditingStops,
  onStopDragEnd,
  onPolylineClick,
  onMapClick
}: MapProps) {
  const defaultCenter: [number, number] = userLocation || [23.8103, 90.4125];
  const [roadPaths, setRoadPaths] = useState<Record<string, [number, number][]>>({});
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  // Fetch road-following path using OSRM
  useEffect(() => {
    const fetchPaths = async () => {
      const newPaths: Record<string, [number, number][]> = {};
      for (const route of routes) {
        let coordsString = '';
        
        // Prioritize stops for routing if they exist (especially useful for planning/editing)
        if (route.stops && route.stops.length > 1) {
          coordsString = route.stops.map(s => `${s.lng},${s.lat}`).join(';');
        } else if (route.history && route.history.length > 1) {
          // OSRM public API limits to 100 coordinates. We use the last 50 to be safe and keep URLs short.
          const recentHistory = route.history.slice(-50);
          coordsString = recentHistory.map(h => `${h.lng},${h.lat}`).join(';');
        }

        if (coordsString) {
          try {
            const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`);
            if (!response.ok) {
              throw new Error(`OSRM returned ${response.status}`);
            }
            const data = await response.json();
            if (data.routes && data.routes[0]) {
              newPaths[route.id] = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
            }
          } catch (e) {
            // Silently fallback to straight lines if OSRM fails
          }
        }
      }
      setRoadPaths(newPaths);
    };

    fetchPaths();
  }, [routes]);

  const getRouteColor = (routeId: string) => {
    const index = routes.findIndex(r => r.id === routeId);
    return colors[index % colors.length] || colors[0];
  };

  const BusIconColored = (isSelected: boolean, color: string) => L.divIcon({
    className: 'custom-bus-icon',
    html: `<div class="w-10 h-10 ${isSelected ? 'scale-125 ring-4 ring-opacity-50' : ''} rounded-full border-2 border-white flex items-center justify-center shadow-xl transition-all duration-300" style="background-color: ${color}; ${isSelected ? `box-shadow: 0 0 0 4px ${color}40;` : ''}">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h10c0-1.1.9-2 2-2Z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
          </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

  return (
    <div className={`w-full h-full relative ${isPinpointing ? 'cursor-crosshair' : ''}`}>
      <MapContainer
        center={defaultCenter}
        zoom={13}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showTraffic && (
          <TileLayer
            url="https://tiles.arcgis.com/tiles/nS9W099Ay9p7y9vW/arcgis/rest/services/World_Traffic_Service/MapServer/tile/{z}/{y}/{x}"
            opacity={0.6}
            attribution="Traffic data &copy; Esri"
          />
        )}
        
        <MapEvents onMapClick={onMapClick} isPinpointing={isPinpointing} onPinpoint={onPinpoint} />
        
        <MarkerClusterGroup chunkedLoading>
          {routes.map((route) => (
            route.currentLocation && (
              <Marker 
                key={route.id}
                position={[route.currentLocation.lat, route.currentLocation.lng]}
                icon={BusIconColored(selectedRouteId === route.id, getRouteColor(route.id))}
                eventHandlers={{
                  click: () => onMarkerClick?.(route),
                }}
              >
                <Popup>
                  <div className="p-2 min-w-[200px]">
                    <h3 className="font-bold text-lg text-slate-900">{route.name}</h3>
                    <p className="text-sm text-slate-600 mb-2">{route.description}</p>
                    
                    {route.analytics && (
                      <div className="grid grid-cols-2 gap-2 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Today</div>
                        <div className="text-[10px] text-slate-900 font-bold text-right">{route.analytics.todayTime || '--:--'}</div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Avg</div>
                        <div className="text-[10px] text-slate-900 font-bold text-right">{route.analytics.averageTimeMinutes}m</div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${route.type === 'public' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                        {route.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(route.currentLocation.updatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          ))}
        </MarkerClusterGroup>

        {userLocation && (
          <Marker position={userLocation} icon={UserIcon}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {manualPin && (
          <Marker position={manualPin} icon={PinIcon}>
            <Popup>Manual Pin Location</Popup>
          </Marker>
        )}

        {routes.map((route) => {
          const isSelected = selectedRouteId === route.id;
          const roadPath = roadPaths[route.id];
          const historyCoords = route.history?.map(h => [h.lat, h.lng] as [number, number]) || [];
          const routeColor = getRouteColor(route.id);

          return (
            <div key={`path-${route.id}`}>
              {/* Road Following Path with Glow Effect */}
              {roadPath && isSelected && (
                <>
                  {/* Outer Glow */}
                  <Polyline 
                    positions={roadPath} 
                    color={routeColor} 
                    weight={12} 
                    opacity={0.2} 
                    eventHandlers={{ click: (e) => onPolylineClick?.(route.id, e.latlng.lat, e.latlng.lng) }}
                  />
                  {/* Inner Glow */}
                  <Polyline 
                    positions={roadPath} 
                    color={routeColor} 
                    weight={8} 
                    opacity={0.4} 
                    eventHandlers={{ click: (e) => onPolylineClick?.(route.id, e.latlng.lat, e.latlng.lng) }}
                  />
                  {/* Main Line */}
                  <Polyline 
                    positions={roadPath} 
                    color={routeColor} 
                    weight={4} 
                    opacity={1} 
                    eventHandlers={{ click: (e) => onPolylineClick?.(route.id, e.latlng.lat, e.latlng.lng) }}
                  />
                </>
              )}

              {/* Fallback History Path if OSRM fails or for segments */}
              {!roadPath && historyCoords.length > 1 && isSelected && (
                <Polyline 
                  positions={historyCoords} 
                  color={routeColor} 
                  weight={4} 
                  opacity={0.6} 
                  dashArray="10, 10"
                  eventHandlers={{ click: (e) => onPolylineClick?.(route.id, e.latlng.lat, e.latlng.lng) }}
                />
              )}

              {/* Render Stops */}
              {isSelected && route.stops?.map(stop => (
                <Marker
                  key={stop.id}
                  position={[stop.lat, stop.lng]}
                  icon={StopIcon(routeColor)}
                  draggable={isEditingStops}
                  eventHandlers={{
                    dragend: (e) => {
                      const marker = e.target;
                      const position = marker.getLatLng();
                      onStopDragEnd?.(route.id, stop.id, position.lat, position.lng);
                    }
                  }}
                >
                  <Popup>
                    <div className="p-1">
                      <p className="font-bold text-sm text-slate-900">{stop.name}</p>
                      <p className="text-xs text-slate-500">ETA: {stop.arrivalTime}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </div>
          );
        })}

        {userLocation && <MapUpdater center={userLocation} />}
      </MapContainer>
      
      {isPinpointing && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg font-medium animate-bounce">
          Click on the map to set location
        </div>
      )}
    </div>
  );
}
