import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Phone, Users, Settings, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export type Tab = 'chats' | 'calls' | 'contacts' | 'ai' | 'settings';

interface BottomNavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [missedCalls, setMissedCalls] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Listen for unread messages count
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubChats = onSnapshot(chatsQuery, (snap) => {
      let total = 0;
      snap.docs.forEach(doc => {
        const data = doc.data();
        total += data.unreadCount?.[user.uid] || 0;
      });
      setUnreadMessages(total);
    }, (error) => {
      console.error("BottomNav Chats Listener Error:", error);
    });

    // Listen for missed calls (not seen yet)
    const callsQuery = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', user.uid),
      where('status', '==', 'rejected'),
      where('seen', '==', false)
    );

    const unsubCalls = onSnapshot(callsQuery, (snap) => {
      setMissedCalls(snap.docs.length);
    }, (error) => {
      console.error("BottomNav Calls Listener Error:", error);
    });

    return () => {
      unsubChats();
      unsubCalls();
    };
  }, [user]);

  useEffect(() => {
    if (activeTab === 'calls' && user && missedCalls > 0) {
      const markAsSeen = async () => {
        const q = query(
          collection(db, 'calls'),
          where('participants', 'array-contains', user.uid),
          where('status', '==', 'rejected'),
          where('seen', '==', false)
        );
        const snap = await getDocs(q);
        if (snap.empty) return;

        const batch = writeBatch(db);
        snap.docs.forEach(d => {
          batch.update(d.ref, { seen: true });
        });
        await batch.commit();
      };
      markAsSeen();
    }
  }, [activeTab, user, missedCalls]);

  const tabs = [
    { id: 'chats', label: 'الدردشة', icon: MessageSquare },
    { id: 'calls', label: 'المكالمات', icon: Phone },
    { id: 'ai', label: 'الذكاء', icon: Sparkles },
    { id: 'contacts', label: 'الجهات', icon: Users },
    { id: 'settings', label: 'الإعدادات', icon: Settings },
  ] as const;

  return (
    <div className="p-4 pt-1 z-50 shrink-0 w-full bg-white/90 backdrop-blur-md border-t border-gray-100">
      <nav className="h-16 flex items-center justify-around px-2 relative">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative flex flex-col items-center justify-center flex-1 transition-all group py-1"
          >
            <div className={cn(
              "p-2.5 rounded-2xl transition-all duration-300 relative z-10",
              activeTab === tab.id ? "text-blue-600 scale-110 shadow-premium bg-white/90" : "text-gray-400 group-hover:text-gray-600 group-hover:bg-gray-50/50"
            )}>
              <tab.icon className={cn("h-5 w-5", activeTab === tab.id ? "stroke-[2.5px]" : "stroke-2")} />
              
              {/* High-Impact Notification Badges */}
              <AnimatePresence>
                {tab.id === 'calls' && missedCalls > 0 && (
                  <motion.div
                    initial={{ scale: 0, y: 5 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow-lg border border-white z-20"
                  >
                    {missedCalls > 9 ? '9+' : missedCalls}
                  </motion.div>
                )}
                {tab.id === 'chats' && unreadMessages > 0 && (
                  <motion.div
                    initial={{ scale: 0, y: 5 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-blue-600 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow-lg border border-white z-20"
                  >
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </motion.div>
                )}
              </AnimatePresence>

              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTabSelection"
                  className="absolute inset-0 bg-blue-500/5 rounded-2xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </div>
            
            <AnimatePresence>
              {activeTab === tab.id && (
                <motion.span 
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[9px] font-black uppercase tracking-widest text-blue-600 mt-1"
                >
                  {tab.label}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        ))}
      </nav>
    </div>
  );
};
