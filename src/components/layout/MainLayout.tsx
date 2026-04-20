import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { BottomNav, Tab } from './BottomNav';
import { ChatList } from '../chat/ChatList';
import { CallHistory } from '../calls/CallHistory';
import { ContactList } from '../contacts/ContactList';
import { SettingsView } from '../settings/SettingsView';
import { AIView } from '../ai/AIView';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './Header';
import { ChatRoom } from '../chat/ChatRoom';
import { CallOverlay } from '../calls/CallOverlay';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Call } from '../../types';
import { cn } from '../../lib/utils';
import { PWAInstallPrompt } from '../common/PWAInstallPrompt';

export const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [isLargeScreen, setIsLargeScreen] = useState(window.innerWidth >= 1024);
  const { user, profile } = useAuth();

  // Presence logic: Sync online status with Firebase
  useEffect(() => {
    if (!user?.uid) return;
    const userRef = doc(db, 'users', user.uid);
    
    updateDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {});

    const setOffline = () => updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {});
    
    window.addEventListener('beforeunload', setOffline);
    return () => {
      window.removeEventListener('beforeunload', setOffline);
      setOffline();
    };
  }, [user?.uid]);

  const themeClasses: Record<string, string> = {
    blue: 'theme-blue',
    purple: 'theme-purple',
    emerald: 'theme-emerald',
    rose: 'theme-rose',
  };
  const activeThemeClass = profile?.theme && themeClasses[profile.theme] ? themeClasses[profile.theme] : 'theme-blue';

  useEffect(() => {
    const handleResize = () => setIsLargeScreen(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Listen for active calls (incoming or outgoing)
  useEffect(() => {
    if (!user) return;
    
    // Single consolidated query for active calls where user is a participant
    // This perfectly matches the list rule: if request.auth.uid in participants
    const activeCallsQ = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', user.uid),
      where('status', 'in', ['ringing', 'accepted'])
    );

    const unsub = onSnapshot(activeCallsQ, (snap) => {
      if (snap.empty) {
        setActiveCall(null);
      } else {
        // Sort by creation time locally if needed, but for active calls usually the latest one matters
        const activeCall = { id: snap.docs[0].id, ...snap.docs[0].data() } as Call;
        setActiveCall(activeCall);
      }
    }, (error) => {
      console.error("MainLayout Active Calls Listener Error:", error);
    });

    return () => unsub();
  }, [user]);

  const renderContent = () => {
    switch (activeTab) {
      case 'chats': return <ChatList onChatSelect={setActiveChatId} />;
      case 'calls': return <CallHistory />;
      case 'ai': return <AIView onChatSelect={setActiveChatId} setActiveTab={setActiveTab} />;
      case 'contacts': return <ContactList onStartChat={setActiveChatId} searchTrigger={searchTrigger} />;
      case 'settings': return <SettingsView />;
    }
  };

  return (
    <div className={cn("flex h-screen bg-mesh overflow-hidden relative theme-transition", activeThemeClass)} dir="rtl">
      {/* Recipe 7: Atmospheric Overlays */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[20%] w-[40%] h-[40%] bg-accent-primary/10 rounded-full blur-[100px] animate-pulse-soft" />
        <div className="absolute bottom-[20%] right-[10%] w-[35%] h-[35%] bg-accent-secondary/10 rounded-full blur-[100px] animate-pulse-soft" style={{ animationDelay: '3s' }} />
        <div className="absolute top-[40%] right-[30%] w-[30%] h-[30%] bg-accent-primary/5 rounded-full blur-[100px] animate-pulse-soft" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* Main Container with refined Glass effect */}
      <div className="flex-1 flex overflow-hidden relative z-10 w-full lg:m-4 lg:rounded-[40px] lg:border lg:border-white/40 bg-white/60 backdrop-blur-[50px] shadow-huge transition-all duration-700">
        
        {/* Sidebar - Precision List Area */}
        <aside className={cn(
          "flex flex-col border-l border-gray-100 bg-white/40 transition-all duration-300 relative h-full backdrop-blur-md",
          isLargeScreen ? "w-[420px] min-w-[420px]" : "w-full",
          (!isLargeScreen && activeChatId) ? "hidden" : "flex"
        )}>
          <Header 
            title={
              activeTab === 'chats' ? 'الدردشات' :
              activeTab === 'calls' ? 'المكالمات' :
              activeTab === 'ai' ? 'مساعد الذكاء' :
              activeTab === 'contacts' ? 'جهات الاتصال' : 'الإعدادات'
            } 
            onAddContact={activeTab === 'chats' || activeTab === 'contacts' ? () => {
              setActiveTab('contacts');
              setSearchTrigger(prev => prev + 1);
            } : undefined}
          />
          
          <div className="flex-1 min-h-0 relative overflow-hidden bg-gray-50/10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full w-full"
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>

          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </aside>

        {/* Content Area (Chat Room) */}
        <div className={cn(
          "flex-1 relative flex flex-col bg-slate-50/50 transition-all",
          (!isLargeScreen && !activeChatId) ? "hidden" : "flex"
        )}>
          <AnimatePresence mode="wait">
            {activeChatId ? (
              <ChatRoom 
                key={activeChatId} 
                chatId={activeChatId} 
                onClose={() => setActiveChatId(null)} 
                isEmbedded={isLargeScreen}
              />
            ) : (
              <div className="hidden lg:flex flex-col items-center justify-center h-full text-center p-12">
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
                  <div className="w-40 h-40 bg-white rounded-full flex items-center justify-center shadow-2xl relative z-10 animate-float border-8 border-white">
                    <img src="/logo.png" alt="Logo" className="w-24 h-24 grayscale opacity-20 pointer-events-none" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    <span className="text-6xl">💬</span>
                  </div>
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">مرحباً بك في عالمك الخاص</h2>
                <p className="text-gray-400 font-bold text-lg max-w-sm leading-relaxed">
                  اختر محادثة من القائمة الجانبية للبدء، أو تواصل مع مساعدك الذكي الآن!
                </p>
                <div className="mt-8 flex gap-3">
                  <div className="px-4 py-2 bg-blue-50 text-blue-500 rounded-2xl text-xs font-black uppercase tracking-widest border border-blue-100 shadow-sm">تشفير تام</div>
                  <div className="px-4 py-2 bg-green-50 text-green-500 rounded-2xl text-xs font-black uppercase tracking-widest border border-green-100 shadow-sm">متصل دائماً</div>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {activeCall && (
          <CallOverlay 
            call={activeCall} 
            isIncoming={activeCall.receiverId === user?.uid} 
            onEnd={() => setActiveCall(null)} 
          />
        )}
      </AnimatePresence>
      <PWAInstallPrompt />
    </div>
  );
};
