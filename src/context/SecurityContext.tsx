import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { PINOverlay } from '../components/security/PINOverlay';
import { AnimatePresence } from 'motion/react';

interface SecurityContextType {
  isLocked: boolean;
  setLocked: (locked: boolean) => void;
  triggerSetup: (action: 'setup' | 'change') => void;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isLocked, setLocked] = useState(false);
  const [overlayMode, setOverlayMode] = useState<'unlock' | 'setup' | 'change' | null>(null);
  const [securitySettings, setSecuritySettings] = useState<any>(null);
  const [lastActive, setLastActive] = useState(Date.now());

  useEffect(() => {
    if (!user) {
      setLocked(false);
      setOverlayMode(null);
      return;
    }

    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const settings = snap.data().security;
        setSecuritySettings(settings);
        
        if (settings?.isEnabled && !isLocked && !overlayMode) {
          // Initial check
          setOverlayMode('unlock');
          setLocked(true)
        }
      }
    });

    return () => unsub();
  }, [user]);

  // Handle visibility change for auto-lock
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setLastActive(Date.now());
      } else {
        if (user && securitySettings?.isEnabled && !isLocked) {
          const now = Date.now();
          const inactiveMinutes = (now - lastActive) / 1000 / 60;
          if (inactiveMinutes >= (securitySettings.lockDelay || 0)) {
            setLocked(true);
            setOverlayMode('unlock');
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, securitySettings, lastActive, isLocked]);

  const triggerSetup = (action: 'setup' | 'change') => {
    setOverlayMode(action);
  };

  // Listen for global AI triggers
  useEffect(() => {
    const handleAITrigger = (e: any) => {
      if (e.detail?.action === 'setup' || e.detail?.action === 'change') {
        setOverlayMode(e.detail.action as any);
      }
    };
    window.addEventListener('ai-trigger-security', handleAITrigger);
    return () => window.removeEventListener('ai-trigger-security', handleAITrigger);
  }, []);

  return (
    <SecurityContext.Provider value={{ isLocked, setLocked, triggerSetup }}>
      {children}
      <AnimatePresence>
        {overlayMode && (
          <PINOverlay 
            mode={overlayMode} 
            onSuccess={() => {
              setOverlayMode(null);
              setLocked(false);
            }} 
            onCancel={overlayMode !== 'unlock' ? () => setOverlayMode(null) : undefined}
          />
        )}
      </AnimatePresence>
    </SecurityContext.Provider>
  );
};

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};
