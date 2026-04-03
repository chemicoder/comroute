import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Plus, Users, Shield, Copy, Check, Mail, Trash2, Loader2 } from 'lucide-react';
import { Institute, Route } from '../types';

export default function InstitutePanel() {
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newRoute, setNewRoute] = useState({ name: '', description: '' });
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setInstitute(null);
        return;
      }

      const q = query(collection(db, 'institutes'), where('adminId', '==', user.uid));
      const unsubscribeSnap = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          setInstitute({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Institute);
        }
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'institutes');
        }
      });

      return () => unsubscribeSnap();
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!institute || !auth.currentUser) {
      setRoutes([]);
      return;
    }

    const q = query(collection(db, 'routes'), where('instituteId', '==', institute.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRoutes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route)));
    }, (error) => {
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'routes');
      }
    });

    return () => unsubscribe();
  }, [institute]);

  const createRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !institute || !newRoute.name) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'routes'), {
        name: newRoute.name,
        description: newRoute.description,
        type: 'private',
        instituteId: institute.id,
        driverId: auth.currentUser.uid,
        isActive: false,
        lastUpdated: new Date().toISOString(),
        invitedUsers: [],
        analytics: {
          averageTimeMinutes: 30,
          todayTime: '07:45 AM',
          tomorrowExpectedTime: '07:45 AM'
        }
      });
      setNewRoute({ name: '', description: '' });
      setIsCreating(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'routes');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouteId || !inviteEmail) return;

    setIsSubmitting(true);
    try {
      // In a real app, we'd look up the UID by email. 
      // For this demo, we'll store the email directly in invitedUsers or simulate a UID.
      await updateDoc(doc(db, 'routes', selectedRouteId), {
        invitedUsers: arrayUnion(inviteEmail)
      });
      setInviteEmail('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${selectedRouteId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyInviteCode = () => {
    if (institute?.inviteCode) {
      navigator.clipboard.writeText(institute.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!institute) {
    return (
      <div className="space-y-6">
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-full">
              <Shield size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Institute Admin</h2>
              <p className="text-slate-500 mt-1">Manage private tracking for your organization.</p>
            </div>
            <button 
              onClick={async () => {
                if (!auth.currentUser) return;
                setIsSubmitting(true);
                try {
                  await addDoc(collection(db, 'institutes'), {
                    name: 'My Institute',
                    adminId: auth.currentUser.uid,
                    inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase()
                  });
                } catch (error) {
                  handleFirestoreError(error, OperationType.CREATE, 'institutes');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              disabled={isSubmitting}
              className="mt-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              Setup Institute
            </button>
          </div>
        </div>

        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Users size={18} className="text-blue-600" />
            Join Private Route
          </h3>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Enter Invite Code"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <button className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium">Join</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{institute.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
              Invite Code: {institute.inviteCode}
            </span>
            <button onClick={copyInviteCode} className="text-slate-400 hover:text-slate-600">
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
        </button>
      </div>

      {isCreating && (
        <form onSubmit={createRoute} className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <h3 className="text-sm font-bold text-slate-700">New Private Route</h3>
          <input 
            type="text" 
            required
            value={newRoute.name}
            onChange={(e) => setNewRoute({ ...newRoute, name: e.target.value })}
            placeholder="Route Name (e.g. School Bus A)"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <textarea 
            value={newRoute.description}
            onChange={(e) => setNewRoute({ ...newRoute, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm h-20"
          />
          <div className="flex gap-2">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Create Route
            </button>
            <button 
              type="button" 
              onClick={() => setIsCreating(false)} 
              className="px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Private Routes</h3>
        {routes.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No private routes created yet.</p>
        ) : (
          routes.map(route => (
            <div key={route.id} className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${route.isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                  <span className="font-bold text-slate-700">{route.name}</span>
                </div>
                <button 
                  onClick={() => setSelectedRouteId(selectedRouteId === route.id ? null : route.id)}
                  className="text-xs text-blue-600 font-medium hover:underline"
                >
                  {selectedRouteId === route.id ? 'Close' : 'Invite Users'}
                </button>
              </div>

              {selectedRouteId === route.id && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <form onSubmit={inviteUser} className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input 
                        type="email" 
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="User Email"
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                    >
                      Invite
                    </button>
                  </form>
                  
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Invited Users</p>
                    {route.invitedUsers && route.invitedUsers.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {route.invitedUsers.map((email, idx) => (
                          <span key={idx} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] text-slate-600 flex items-center gap-1">
                            {email}
                            <button className="text-slate-300 hover:text-red-500"><Trash2 size={10} /></button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">No users invited yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
