import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, setDoc, serverTimestamp, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Chat, UserProfile } from '../../types';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Input } from '../ui/input';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { MoreHorizontal, Pin, BellOff, Trash2, Search, MessageSquare, ShieldAlert, Clock, Check, CheckCheck } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../ui/context-menu';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { ChatListSkeleton } from './ChatListSkeleton';

interface ChatListProps {
  onChatSelect: (id: string) => void;
}

export const ChatList: React.FC<ChatListProps> = ({ onChatSelect }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'pinned'>('all');
  const [blockingChat, setBlockingChat] = useState<Chat | null>(null);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [blockDuration, setBlockDuration] = useState<'perm' | '1h' | '24h' | '7d'>('perm');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snap) => {
      setLoading(true);
      const chatList = await Promise.all(snap.docs.map(async (chatDoc) => {
        const data = chatDoc.data() as Chat;
        const otherUserId = data.participants.find(id => id !== user.uid);
        let otherUser: UserProfile | undefined;
        
        if (otherUserId) {
          // Try contacts first
          const contactSnap = await getDoc(doc(db, 'users', user.uid, 'contacts', otherUserId));
          if (contactSnap.exists()) {
            otherUser = contactSnap.data() as UserProfile;
          } else {
            // Fallback to global users
            const userSnap = await getDoc(doc(db, 'users', otherUserId));
            if (userSnap.exists()) {
              otherUser = userSnap.data() as UserProfile;
            }
          }
        }

        return {
          ...data,
          id: chatDoc.id,
          otherUser
        };
      }));
      setChats(chatList);
      setLoading(false);
    }, (error) => {
      console.error("ChatList Listener Error:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const deleteChat = async () => {
    if (!chatToDelete) return;
    try {
      await deleteDoc(doc(db, 'chats', chatToDelete.id));
      toast.success('تم حذف المحادثة بنجاح');
      setChatToDelete(null);
    } catch (error) {
      toast.error('فشل حذف المحادثة');
    }
  };

  const togglePin = async (chatId: string, isPinned: boolean) => {
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        isPinned: !isPinned,
        pinnedAt: !isPinned ? serverTimestamp() : null
      });
      toast.success(isPinned ? 'تم إلغاء التثبيت' : 'تم تثبيت المحادثة');
    } catch (error) {
      toast.error('حدث خطأ أثناء التثبيت');
    }
  };

  const blockUser = async () => {
    if (!user || !blockingChat?.otherUser) return;
    try {
      let expiresAt = null;
      const now = new Date();
      if (blockDuration === '1h') expiresAt = new Date(now.getTime() + 3600000);
      else if (blockDuration === '24h') expiresAt = new Date(now.getTime() + 86400000);
      else if (blockDuration === '7d') expiresAt = new Date(now.getTime() + 604800000);

      await setDoc(doc(db, 'users', user.uid, 'blocks', blockingChat.otherUser.uid), {
        blockedUserId: blockingChat.otherUser.uid,
        blockedAt: serverTimestamp(),
        expiresAt: expiresAt ? expiresAt : null,
        unblockRequestCount: 0,
        displayName: blockingChat.otherUser.displayName,
        photoURL: blockingChat.otherUser.photoURL
      });

      toast.success(`تم حظر ${blockingChat.otherUser.displayName} بنجاح`);
      setBlockingChat(null);
    } catch (error) {
      toast.error('فشل حظر المستخدم');
    }
  };

  const filteredChats = chats.filter(c => {
    const matchesSearch = c.otherUser?.displayName?.toLowerCase().includes(search.toLowerCase()) ||
                          c.lastMessage?.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    
    if (filter === 'unread') return (c.unreadCount?.[user?.uid || ''] || 0) > 0;
    if (filter === 'pinned') return !!c.isPinned;
    return true;
  }).sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  if (loading && chats.length === 0) {
    return <ChatListSkeleton />;
  }

  if (chats.length === 0 && !search) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-white/50 animate-in fade-in duration-700">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative mb-10"
        >
          <div className="absolute inset-[-20px] bg-blue-100/30 rounded-full blur-3xl animate-pulse" />
          <div className="w-28 h-28 bg-white rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-blue-100 relative z-10 border border-blue-50">
            <MessageSquare className="h-12 w-12 text-blue-500" />
          </div>
          <motion.div 
             animate={{ y: [0, -5, 0] }}
             transition={{ repeat: Infinity, duration: 3 }}
             className="absolute -top-4 -right-4 h-10 w-10 bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-lg"
          >
            <Search className="h-5 w-5" />
          </motion.div>
        </motion.div>
        
        <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">مستعد لبدء المحادثة؟</h3>
        <p className="text-gray-400 font-bold text-sm max-w-[260px] leading-relaxed mb-8">
          عالمك من الأصدقاء ينتظر. ابحث عن جهات اتصالك وابدأ تواصلك الأول الآن!
        </p>
        
        <div className="flex flex-col gap-3 w-full max-w-xs">
           <Button className="h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 font-black shadow-lg shadow-blue-200">
             استكشاف جهات الاتصال
           </Button>
           <p className="text-[10px] font-black uppercase text-gray-300 tracking-[0.2em] mt-4">Verified Communication Platform</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50/10 flex flex-col">
      <div className="px-6 pt-6 pb-2">
        <h2 className="text-2xl font-black text-gray-900 tracking-tight">الدردشات</h2>
        <p className="text-[10px] font-black uppercase tracking-widest text-accent-primary/60 mt-0.5">ولديك {chats.length} محادثة نشطة</p>
        
        {/* Search Bar */}
        <div className="mt-4 relative group">
          <Input 
            placeholder="البحث في المحادثات..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-2xl bg-white border-gray-100 pl-10 h-11 text-right font-bold text-sm focus:ring-accent-primary/20 transition-all shadow-sm"
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-accent-primary transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar py-1">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'unread', label: 'غير المقروءة' },
            { id: 'pinned', label: 'المثبتة' }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={cn(
                "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border whitespace-nowrap",
                filter === f.id 
                  ? "bg-accent-primary text-white border-accent-primary shadow-lg shadow-accent-primary/25" 
                  : "bg-white text-gray-400 border-gray-100 hover:border-accent-primary/30"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      
      <ScrollArea className="flex-1 px-4">
        {filteredChats.length === 0 && search && (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
             <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-gray-300" />
             </div>
             <p className="text-sm font-black text-gray-400">لا توجد محادثات تطابق بحثك</p>
          </div>
        )}
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.05
              }
            }
          }}
          className="flex flex-col gap-2 pb-32"
        >
          {filteredChats.map((chat) => (
            <motion.div
              key={chat.id}
              layout
              variants={{
                hidden: { opacity: 0, y: 10, scale: 0.95 },
                visible: { opacity: 1, y: 0, scale: 1 }
              }}
              whileHover={{ 
                scale: 1.01,
                x: 2,
                boxShadow: "0 12px 25px -10px rgba(59, 130, 246, 0.25)" 
              }}
              className="relative group pr-2 mb-1"
            >
              <ContextMenu>
                <ContextMenuTrigger>
                    <button
                      onClick={() => onChatSelect(chat.id)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-[24px] transition-all border shadow-premium hover:shadow-huge active:scale-[0.985] text-right group relative overflow-hidden",
                        chat.isPinned ? "border-accent-primary/20 bg-accent-primary/5" : "border-accent-primary/5 hover:bg-white hover:border-accent-primary/20"
                      )}
                    >
                      {/* Visual Accent Decoration */}
                      <div className={cn(
                        "absolute top-0 right-0 w-1 h-full bg-accent-primary/0 group-hover:bg-accent-primary transition-all duration-500",
                        chat.isPinned && "bg-accent-primary w-1.5 opacity-100"
                      )} />
                      
                      <div className="relative shrink-0">
                        <div className="absolute inset-0 bg-accent-primary/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-700" />
                        <Avatar className="h-14 w-14 p-0.5 border-2 border-white shadow-premium ring-2 ring-transparent group-hover:ring-accent-primary/10 transition-all relative z-10">
                          <AvatarImage src={chat.otherUser?.photoURL} className="object-cover rounded-full" />
                          <AvatarFallback className="bg-gradient-to-br from-accent-primary to-accent-secondary text-white font-black text-sm">
                            {chat.otherUser?.displayName?.[0] || '?'}
                          </AvatarFallback>
                        </Avatar>
                        {chat.otherUser?.isOnline && (
                          <div className="absolute bottom-0.5 right-0.5 h-4 w-4 bg-green-500 border-2 border-white rounded-full shadow-lg shadow-green-500/20 z-20" />
                        )}
                        {chat.isPinned && (
                          <div className="absolute -top-1 -left-1 h-5 w-5 bg-accent-primary text-white rounded-full border-2 border-white flex items-center justify-center shadow-lg z-20">
                            <Pin className="h-2.5 w-2.5 fill-current" />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <h3 className="font-black text-gray-900 truncate tracking-tight text-[14px] group-hover:text-accent-primary transition-colors flex items-center gap-2">
                            {chat.otherUser?.displayName || 'مستخدم غير معروف'}
                            {chat.otherUser?.isInCall && (
                              <span className="flex items-center gap-1.5 px-1.5 py-0.5 bg-red-50 rounded-lg border border-red-100">
                                <span className="h-1.5 w-1.5 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-[7px] text-red-500 font-black uppercase tracking-tighter shrink-0">مشغول الآن</span>
                              </span>
                            )}
                          </h3>
                          <span className="text-[8px] text-gray-400 font-black uppercase tracking-[0.15em] whitespace-nowrap bg-gray-50/80 px-2 py-0.5 rounded-full border border-gray-100/50">
                            {chat.updatedAt?.toDate() ? formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: true, locale: ar }) : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex-1 min-w-0">
                             {chat.otherUser && chat.typing?.[chat.otherUser.uid] ? (
                               <motion.div 
                                 initial={{ opacity: 0, x: -5 }}
                                 animate={{ opacity: 1, x: 0 }}
                                 className="flex items-center gap-1.5"
                               >
                                 <div className="flex gap-0.5">
                                   <span className="w-1 h-1 bg-accent-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                                   <span className="w-1 h-1 bg-accent-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                                   <span className="w-1 h-1 bg-accent-primary rounded-full animate-bounce" />
                                 </div>
                                 <p className="text-[12px] text-accent-primary font-extrabold italic">جاري الكتابة...</p>
                               </motion.div>
                             ) : (
                               <div className="flex items-center gap-1.5 min-w-0">
                                 {chat.lastMessageSenderId === user?.uid && (
                                   <div className="shrink-0">
                                      {chat.lastMessageRead ? 
                                        <CheckCheck className="h-3 w-3 text-accent-primary" /> : 
                                        <Check className="h-3 w-3 text-gray-300" />
                                      }
                                   </div>
                                 )}
                                 <p className={cn(
                                   "text-[12px] truncate transition-colors",
                                   (chat.unreadCount?.[user?.uid || ''] || 0) > 0 ? "text-accent-primary font-black" : "text-gray-400 font-medium"
                                 )}>
                                   {chat.lastMessage || 'محادثة جديدة...'}
                                 </p>
                               </div>
                             )}
                          </div>
                          
                          {/* High-Impact Unread Badge */}
                          {(chat.unreadCount?.[user?.uid || ''] || 0) > 0 && (
                            <motion.div 
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent-primary text-white text-[9px] font-black shadow-lg shadow-accent-primary/30 border border-white/20"
                            >
                              {chat.unreadCount?.[user?.uid || '']! > 9 ? '9+' : chat.unreadCount?.[user?.uid || '']}
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="rounded-2xl p-1.5 min-w-[170px] shadow-huge border-gray-100" dir="rtl">
                  <ContextMenuItem 
                    className="rounded-xl p-2.5 gap-2.5 cursor-pointer focus:bg-accent-primary/5 focus:text-accent-primary"
                    onClick={() => togglePin(chat.id, !!chat.isPinned)}
                  >
                    <Pin className={cn("h-4 w-4", chat.isPinned && "fill-current")} />
                    <span className="text-xs font-bold">{chat.isPinned ? 'إلغاء التثبيت' : 'تثبيت المحادثة'}</span>
                  </ContextMenuItem>
                  <ContextMenuItem 
                    className="rounded-xl p-2.5 gap-2.5 cursor-pointer focus:bg-red-50 focus:text-red-500"
                    onClick={() => setBlockingChat(chat)}
                  >
                    <ShieldAlert className="h-4 w-4" />
                    <span className="text-xs font-bold">حظر المستخدم</span>
                  </ContextMenuItem>
                  <ContextMenuItem 
                    className="rounded-xl p-2.5 gap-2.5 cursor-pointer focus:bg-red-50 focus:text-red-600"
                    onClick={() => setChatToDelete(chat)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="text-xs font-bold">حذف المحادثة</span>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {/* Quick Actions Dropdown */}
              <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-accent-primary transition-all outline-none">
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="rounded-2xl p-1.5 min-w-[170px] shadow-huge border-gray-100" dir="rtl">
                    <DropdownMenuItem 
                      className="rounded-xl p-2.5 gap-2.5 cursor-pointer focus:bg-accent-primary/5 focus:text-accent-primary"
                      onClick={(e) => { e.stopPropagation(); togglePin(chat.id, !!chat.isPinned); }}
                    >
                      <Pin className={cn("h-4 w-4", chat.isPinned && "fill-current")} />
                      <span className="text-xs font-bold">{chat.isPinned ? 'إلغاء التثبيت' : 'تثبيت المحادثة'}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="rounded-xl p-2.5 gap-2.5 cursor-pointer focus:bg-red-50 focus:text-red-500"
                      onClick={(e) => { e.stopPropagation(); setBlockingChat(chat); }}
                    >
                      <ShieldAlert className="h-4 w-4" />
                      <span className="text-xs font-bold">حظر المستخدم</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="rounded-xl p-2.5 gap-2.5 cursor-pointer focus:bg-red-50 focus:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        setChatToDelete(chat);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="text-xs font-bold">حذف المحادثة</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </ScrollArea>

      {/* Block Confirmation Dialog */}
      <Dialog open={!!blockingChat} onOpenChange={(open) => !open && setBlockingChat(null)}>
        <DialogContent className="rounded-[32px] max-w-[90vw] sm:max-w-md border-none shadow-huge" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900 text-right flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-red-500" />
              حظر المستخدم
            </DialogTitle>
            <DialogDescription className="text-right text-gray-500 font-bold text-sm">
              سيتم منع {blockingChat?.otherUser?.displayName} من الدردشة معك أو الاتصال بك. يمكنك تحديد مدة الحظر:
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-4">
            {[
              { id: 'perm', label: 'دائم', icon: ShieldAlert },
              { id: '1h', label: 'ساعة واحدة', icon: Clock },
              { id: '24h', label: '24 ساعة', icon: Clock },
              { id: '7d', label: '7 أيام', icon: Clock },
            ].map((dur) => (
              <button
                key={dur.id}
                onClick={() => setBlockDuration(dur.id as any)}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-3xl border-2 transition-all active:scale-95 group",
                  blockDuration === dur.id 
                    ? "bg-red-50 border-red-200 text-red-600 shadow-sm" 
                    : "bg-gray-50 border-transparent text-gray-400 hover:border-gray-200"
                )}
              >
                <dur.icon className={cn("h-6 w-6 transition-transform group-hover:scale-110", blockDuration === dur.id ? "text-red-500" : "text-gray-300")} />
                <span className="text-xs font-black">{dur.label}</span>
              </button>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button 
              className="flex-1 rounded-2xl bg-red-600 hover:bg-red-700 font-black h-12 shadow-lg shadow-red-500/20"
              onClick={blockUser}
            >
              تأكيد الحظر
            </Button>
            <Button 
              variant="ghost" 
              className="flex-1 rounded-2xl h-12 font-bold"
              onClick={() => setBlockingChat(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!chatToDelete} onOpenChange={(open) => !open && setChatToDelete(null)}>
        <DialogContent className="rounded-[32px] max-w-[90vw] sm:max-w-md border-none shadow-huge" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900 text-right flex items-center gap-2">
              <Trash2 className="h-6 w-6 text-red-600" />
              حذف المحادثة نهائياً
            </DialogTitle>
            <DialogDescription className="text-right text-gray-500 font-bold text-sm">
              هل أنت متأكد من رغبتك في حذف المحادثة مع <span className="text-red-600">"{chatToDelete?.otherUser?.displayName}"</span>؟ سيتم حذف جميع الرسائل والوسائط فوراً ولا يمكن استعادتها.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-6">
             <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center animate-pulse">
                <Trash2 className="h-10 w-10 text-red-500" />
             </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-3">
            <Button 
              className="flex-1 rounded-2xl bg-red-600 hover:bg-red-700 font-black h-12 shadow-lg shadow-red-500/20 order-2 sm:order-1"
              onClick={deleteChat}
            >
              نعم، احذف نهائياً
            </Button>
            <Button 
              variant="ghost" 
              className="flex-1 rounded-2xl h-12 font-bold order-1 sm:order-2"
              onClick={() => setChatToDelete(null)}
            >
              تراجع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
