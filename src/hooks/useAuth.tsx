import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp, collection, query, where, limit, getDocs, runTransaction, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const claimUniqueId = async (uid: string): Promise<string> => {
    let claimedId = '';
    while (!claimedId) {
      const potentialId = `700${Math.floor(100000 + Math.random() * 900000)}`;
      try {
        await runTransaction(db, async (transaction) => {
          const idRef = doc(db, 'occupiedIds', potentialId);
          const idDoc = await transaction.get(idRef);
          if (idDoc.exists()) {
            throw new Error('ID_TAKEN');
          }
          transaction.set(idRef, { uid });
          claimedId = potentialId;
        });
      } catch (e: any) {
        if (e.message !== 'ID_TAKEN') throw e;
      }
    }
    return claimedId;
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userDoc = doc(db, 'users', user.uid);
        
        // Use onSnapshot for real-time profile updates
        unsubscribeProfile = onSnapshot(userDoc, async (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            if (!data.specialId) {
              const specialId = await claimUniqueId(user.uid);
              await updateDoc(userDoc, { specialId });
            } else {
              setProfile(data);
            }
          } else {
            const specialId = await claimUniqueId(user.uid);
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || user.email?.split('@')[0] || 'Unknown',
              photoURL: user.photoURL || '',
              specialId,
              isOnline: true,
              lastSeen: new Date()
            };
            await setDoc(userDoc, {
              ...newProfile,
              lastSeen: serverTimestamp()
            });
          }
        });

        // Set online status
        await updateDoc(userDoc, {
          isOnline: true,
          lastSeen: serverTimestamp()
        }).catch(err => {
          // If doc doesn't exist yet, it will be created by onSnapshot logic or first login
          console.log("Welcome new user");
        });

      } else {
        setProfile(null);
        if (unsubscribeProfile) unsubscribeProfile();
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
