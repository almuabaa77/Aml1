import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Call, UserProfile } from '../../types';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Phone, Video, PhoneOff, Trash2, Calendar, Clock, ArrowUpRight, ArrowDownLeft, PhoneMissed, Search, MoreVertical, Filter, AlertTriangle } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { ar } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../ui/dialog';

interface CallRecord extends Call {
  otherUser?: UserProfile;
}

export const CallHistory: React.FC = () => {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [callToDelete, setCallToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, async (snap) => {
      const callData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Call));
      
      const enrichedCalls = await Promise.all(callData.map(async (call) => {
        const otherId = call.callerId === user.uid ? call.receiverId : call.callerId;
        try {
          const userSnap = await getDoc(doc(db, 'users', otherId));
          return { ...call, otherUser: userSnap.data() as UserProfile };
        } catch (e) {
          console.error("Error fetching user for call history:", e);
          return { ...call };
        }
      }));

      setCalls(enrichedCalls);
      setLoading(false);
    }, (error) => {
      console.error("Call History Listener Error:", error);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const handleDelete = async () => {
    if (!callToDelete) return;
    try {
      await deleteDoc(doc(db, 'calls', callToDelete));
      toast.success('تم حذف السجل بنجاح');
    } catch (e) {
      toast.error('فشل حذف السجل');
    } finally {
      setCallToDelete(null);
    }
  };

  const filteredCalls = calls.filter(call => {
    const matchesFilter = filter === 'all' || (filter === 'missed' && (call.status === 'rejected' || call.status === 'missed'));
    const matchesSearch = call.otherUser?.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getCallDate = (call: CallRecord) => {
    if (!call.createdAt) return new Date();
    // Handle both Firestore Timestamp and potential Date object
    if (typeof (call.createdAt as any).toDate === 'function') {
      return (call.createdAt as any).toDate();
    }
    return new Date(call.createdAt as any);
  };

  const startCall = async (otherUser: UserProfile, type: 'audio' | 'video') => {
    if (!user) return;
    
    // Check if user is blocked
    const blockSnap = await getDoc(doc(db, 'users', otherUser.uid, 'blocks', user.uid));
    if (blockSnap.exists()) {
      toast.error('لا يمكنك إجراء هذه المكالمة', {
        description: 'لقد تم حظرك من قبل هذا المستخدم.'
      });
      return;
    }

    const callId = Math.random().toString(36).substring(7);
    const channelId = `ch_${callId}`;
    
    await setDoc(doc(db, 'calls', callId), {
      id: callId,
      callerId: user.uid,
      receiverId: otherUser.uid,
      status: 'ringing',
      type,
      channelId,
      participants: [user.uid, otherUser.uid],
      createdAt: serverTimestamp()
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa] overflow-hidden">
      {/* Search & Filter Header - Compressed Design */}
      <div className="px-4 py-4 space-y-4 bg-white border-b border-black/5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter">المكالمات</h1>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-black/5">
             <MoreVertical className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-accent-primary transition-colors" />
            <input 
              type="text" 
              placeholder="بحث..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 bg-slate-100 rounded-xl pr-10 pl-3 text-xs font-bold focus:ring-2 focus:ring-accent-primary/20 transition-all outline-none"
            />
          </div>
          <Button variant="outline" className="h-10 w-10 rounded-xl p-0 border-slate-200 shrink-0">
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Dense Tab Switching */}
        <div className="flex p-1 bg-slate-100 rounded-xl w-full max-w-[240px] mx-auto">
          <button 
            onClick={() => setFilter('all')}
            className={cn(
              "flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              filter === 'all' ? "bg-white shadow-sm text-accent-primary" : "text-slate-400"
            )}
          >
            الكل
          </button>
          <button 
            onClick={() => setFilter('missed')}
            className={cn(
              "flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              filter === 'missed' ? "bg-white shadow-sm text-red-500" : "text-slate-400"
            )}
          >
            الفائتة
          </button>
        </div>
      </div>

      {/* History List - High Density */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="popLayout" initial={false}>
          {filteredCalls.length > 0 ? (
            <div className="px-3 py-4 space-y-1.5">
              {filteredCalls.map((call) => (
                <motion.div
                  layout
                  key={call.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "group relative p-3 rounded-2xl border transition-all cursor-pointer",
                    (call.status === 'rejected' || call.status === 'missed') 
                      ? "bg-red-50/60 border-red-100 shadow-sm" 
                      : "bg-white border-black/[0.02] hover:border-accent-primary/20"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-11 w-11 rounded-xl border border-white shadow-sm">
                        <AvatarImage src={call.otherUser?.photoURL} />
                        <AvatarFallback className="bg-slate-200 text-slate-500 font-bold text-xs">
                          {call.otherUser?.displayName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "absolute -bottom-1 -left-1 h-5 w-5 rounded-md flex items-center justify-center border border-white shadow-sm",
                        (call.status === 'rejected' || call.status === 'missed') ? "bg-red-500" : "bg-emerald-500"
                      )}>
                        {(call.status === 'rejected' || call.status === 'missed') ? (
                          <PhoneMissed className="h-2.5 w-2.5 text-white" />
                        ) : call.callerId === user?.uid ? (
                          <ArrowUpRight className="h-2.5 w-2.5 text-white" />
                        ) : (
                          <ArrowDownLeft className="h-2.5 w-2.5 text-white" />
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className={cn(
                        "font-bold text-slate-900 mb-0.5 text-sm truncate transition-colors flex items-center gap-1.5",
                        (call.status === 'rejected' || call.status === 'missed') && "text-red-600 font-black"
                      )}>
                        {call.otherUser?.displayName}
                        {(call.status === 'rejected' || call.status === 'missed') && (
                          <PhoneMissed className="h-3 w-3 inline-block" />
                        )}
                      </h3>
                      <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
                        <span className="truncate">
                          {isToday(getCallDate(call)) 
                            ? `اليوم، ${format(getCallDate(call), 'hh:mm a', { locale: ar })}`
                            : format(getCallDate(call), 'd MMMM', { locale: ar })}
                        </span>
                        {call.duration && call.duration > 0 && (
                          <>
                            <span className="h-0.5 w-0.5 rounded-full bg-slate-300 shrink-0" />
                            <span className="text-accent-primary font-black uppercase tracking-tighter">
                              {Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, '0')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 grayscale group-hover:grayscale-0 transition-all">
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         className="h-8 w-8 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                         onClick={(e) => {
                           e.stopPropagation();
                           setCallToDelete(call.id);
                         }}
                       >
                         <Trash2 className="h-3.5 w-3.5" />
                       </Button>
                       <Button 
                         variant="secondary" 
                         size="icon" 
                         className="h-9 w-9 rounded-xl bg-slate-100 border-none text-slate-600 transition-all hover:scale-105 active:scale-95 shadow-sm"
                         onClick={() => call.otherUser && startCall(call.otherUser, call.type)}
                       >
                         {call.type === 'video' ? <Video className="h-4 w-4 text-accent-primary" /> : <Phone className="h-4 w-4 text-accent-primary" />}
                       </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center p-12 text-center"
            >
              <div className="w-24 h-24 bg-slate-100 rounded-[40px] flex items-center justify-center mb-8 relative">
                 <div className="absolute inset-0 bg-accent-primary/5 rounded-full animate-pulse" />
                 <PhoneOff className="h-10 w-10 text-slate-300" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">لا يوجد اتصالات سابقة</h2>
              <p className="text-slate-400 text-sm max-w-xs font-bold leading-relaxed">تاريخ مكالماتك نظيف. ابدأ بمحادثة أصدقائك الآن!</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!callToDelete} onOpenChange={(open) => !open && setCallToDelete(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-[32px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="p-8 pb-4 flex flex-col items-center text-center">
             <div className="w-20 h-20 bg-red-50 rounded-[30px] flex items-center justify-center mb-6 relative">
                <div className="absolute inset-0 bg-red-100/50 rounded-full animate-ping opacity-20" />
                <AlertTriangle className="h-10 w-10 text-red-500 relative z-10" />
             </div>
             <DialogHeader className="gap-2">
                <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">حذف سجل المكالمة؟</DialogTitle>
                <DialogDescription className="text-slate-500 font-bold leading-relaxed px-4">
                  هل أنت متأكد من رغبتك في حذف هذه المكالمة من سجلك؟ هذا الإجراء لا يمكن التراجع عنه.
                </DialogDescription>
             </DialogHeader>
          </div>
          
          <div className="p-4 bg-slate-50 flex flex-col gap-2">
             <Button 
               variant="default" 
               className="w-full h-14 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-base shadow-lg shadow-red-200"
               onClick={handleDelete}
             >
               نعم، احذف السجل
             </Button>
             <DialogClose render={<Button 
                 variant="ghost" 
                 className="w-full h-12 rounded-2xl text-slate-400 font-black hover:bg-slate-100"
               />}>
                 تراجع
             </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
