import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { collection, query, limit, onSnapshot, addDoc, serverTimestamp, setDoc, doc, getDocs, where, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { MessageSquare, UserPlus, Search, Trash2, Users, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { MoreHorizontal, ShieldAlert, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

interface ContactListProps {
  onStartChat: (id: string) => void;
  searchTrigger?: number;
}

export const ContactList: React.FC<ContactListProps> = ({ onStartChat, searchTrigger }) => {
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [searchId, setSearchId] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [showOnlyOnline, setShowOnlyOnline] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { user, profile } = useAuth();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when trigger changes
  useEffect(() => {
    if (searchTrigger && searchInputRef.current) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchTrigger]);

  // Load existing contacts
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'contacts'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setContacts(snap.docs.map(d => d.data() as UserProfile));
    }, (error) => {
      console.error("ContactList Listener Error:", error);
    });
    return unsubscribe;
  }, [user]);

  const handleSearch = async () => {
    const trimmedId = searchId.trim();
    if (!trimmedId || !user) return;
    
    setSearching(true);
    setSearchResults([]); // Clear previous results
    
    try {
      const q = query(
        collection(db, 'users'),
        where('specialId', '==', trimmedId),
        limit(1)
      );
      
      const snap = await getDocs(q);
      
      if (snap.empty) {
        toast.error('لم يتم العثور على مستخدم بهذا الرقم');
        return;
      }

      const foundUser = snap.docs[0].data() as UserProfile;
      
      if (foundUser.uid === user.uid) {
        toast.info('هذا هو رقمك التعريفي الخاص بك! يمكنك مشاركته مع أصدقائك ليتمكنوا من إضافتك.');
        return;
      }

      setSearchResults([foundUser]);
    } catch (e) {
      console.error("Search error:", e);
      toast.error('فشل الاتصال بقاعدة البيانات، يرجى المحاولة مرة أخرى');
    } finally {
      setSearching(false);
    }
  };

  const addContact = async (contactUser: UserProfile) => {
    if (!user || !profile) return;
    
    // Check if already in contacts to avoid unnecessary writes
    if (contacts.some(c => c.uid === contactUser.uid)) {
      toast.info('هذا المستخدم موجود بالفعل في جهات اتصالك');
      setSearchResults([]);
      setSearchId('');
      return;
    }

    try {
      const batch = writeBatch(db);
      
      // Add to my contacts
      batch.set(doc(db, 'users', user.uid, 'contacts', contactUser.uid), contactUser);
      
      // reciprocal: Add me to their contacts
      batch.set(doc(db, 'users', contactUser.uid, 'contacts', user.uid), profile);
      
      await batch.commit();
      
      toast.success('تمت إضافة جهة الاتصال لدى الطرفين بنجاح');
      setSearchResults([]);
      setSearchId('');
    } catch (e) {
      console.error(e);
      toast.error('فشل في الإضافة. يرجى التأكد من صلاحيات الوصول.');
    }
  };

  const removeContact = async (contactId: string) => {
    if (!user) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'contacts', contactId));
      toast.success('تم حذف جهة الاتصال بنجاح');
      setContactToDelete(null);
    } catch (e) {
      toast.error('فشل في حذف جهة الاتصال');
    } finally {
      setDeleting(false);
    }
  };

  const handleStartChat = async (otherUser: UserProfile) => {
    if (!user) return;
    
    // Check if chat exists
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );
    const snap = await getDocs(q);
    const existingChat = snap.docs.find(d => {
      const parts = d.data().participants as string[];
      return parts.includes(otherUser.uid);
    });

    if (existingChat) {
      onStartChat(existingChat.id);
    } else {
      const newChat = await addDoc(collection(db, 'chats'), {
        participants: [user.uid, otherUser.uid],
        updatedAt: serverTimestamp(),
        lastMessage: ''
      });
      onStartChat(newChat.id);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50/10">
      {/* Smart Search Section */}
      <div className="p-4 px-6">
        <div className="flex flex-col gap-3">
          {/* My ID Info */}
          <div className="flex items-center justify-between bg-blue-50/30 border border-blue-100/50 rounded-2xl p-3 px-4">
            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">رقمك الخاص</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-black text-blue-700 tracking-widest">{profile?.specialId}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 text-[10px] font-bold text-blue-600 hover:bg-blue-100"
                onClick={() => {
                  if (profile?.specialId) {
                    navigator.clipboard.writeText(profile.specialId);
                    toast.success('تم نسخ رقمك الخاص');
                  }
                }}
              >
                نسخ
              </Button>
            </div>
          </div>

          <div className="relative group">
          <div className="absolute inset-0 bg-blue-500/5 rounded-2xl blur-lg group-focus-within:bg-blue-500/10 transition-all" />
          <div className="relative flex items-center bg-white border border-gray-100/50 shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-all focus-within:ring-2 focus-within:ring-blue-100 h-14">
            <Search className="mr-4 h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <Input
              ref={searchInputRef}
              placeholder="ابحث برقم التعريف (7001122)"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="flex-1 border-none focus-visible:ring-0 h-full bg-transparent text-[15px] font-bold text-center font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal placeholder:font-normal placeholder:text-gray-400"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button 
              className="h-10 ml-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black px-6 shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
              onClick={handleSearch}
              disabled={searching}
            >
              {searching ? '...' : 'بحث'}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <ScrollArea className="flex-1 px-6">
        <div className="flex flex-col gap-3 py-4 pb-32">
          {/* Search Results Display */}
          <AnimatePresence>
            {searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="mb-8 p-1 bg-blue-50/50 rounded-[32px] border border-blue-100/30"
              >
                <div className="px-5 py-2 flex justify-between items-center">
                  <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">نتيجة البحث</span>
                  <Button variant="ghost" size="sm" onClick={() => setSearchResults([])} className="h-6 text-[10px] font-bold text-gray-400">إغلاق</Button>
                </div>
                {searchResults.map((u) => (
                  <motion.div 
                    key={u.uid} 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex items-center gap-4 p-4 bg-white rounded-[28px] shadow-xl shadow-blue-500/5 border border-blue-100 ring-4 ring-blue-500/5 mb-2 mx-1"
                  >
                    <div className="relative">
                      <Avatar className="h-14 w-14 border-2 border-white shadow-md">
                        <AvatarImage src={u.photoURL} className="object-cover" />
                        <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-400 text-white font-black text-xl">{u.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 p-1 bg-white rounded-full shadow-sm">
                        <div className={cn("h-3 w-3 rounded-full", u.isOnline ? "bg-green-500" : "bg-gray-300")} />
                      </div>
                    </div>
                    
                    <div className="flex-1 text-right">
                      <h3 className="font-black text-gray-900 leading-none text-base">{u.displayName}</h3>
                      <div className="flex items-center gap-1.5 mt-2 opacity-70">
                        <span className="text-[9px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100/50 uppercase">رقم فريد</span>
                        <p className="text-xs font-mono font-black text-blue-600 tracking-wider uppercase">{u.specialId}</p>
                      </div>
                      {u.bio && <p className="text-[10px] text-gray-400 font-bold mt-1 line-clamp-1">{u.bio}</p>}
                    </div>

                    <Button 
                      size="icon" 
                      className="rounded-2xl bg-blue-600 hover:bg-blue-700 h-12 w-12 shadow-xl shadow-blue-500/20 transition-all active:scale-90"
                      onClick={() => addContact(u)}
                    >
                      <UserPlus className="h-6 w-6 text-white" />
                    </Button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compact Contacts List Header */}
          <div className="flex items-center justify-between px-2 mb-1">
            <div className="flex flex-col">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">جهات الاتصال</h4>
              <span className="text-[9px] font-black text-blue-400 mt-1">{showOnlyOnline ? 'المتصلون الآن فقط' : `الكل (${contacts.length})`}</span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOnlyOnline(!showOnlyOnline)}
              className={cn(
                "h-8 rounded-full px-4 text-[10px] font-black border-none transition-all",
                showOnlyOnline 
                  ? "bg-green-100 text-green-600 shadow-sm shadow-green-100" 
                  : "bg-gray-100 text-gray-400 hover:bg-gray-200"
              )}
            >
              {showOnlyOnline ? 'عرض الكل' : 'المتصلون الآن'}
              <div className={cn(
                "h-1.5 w-1.5 rounded-full mr-2",
                showOnlyOnline ? "bg-green-500 animate-pulse" : "bg-gray-300"
              )} />
            </Button>
          </div>
          
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
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          >
            {contacts.filter(c => showOnlyOnline ? c.isOnline : true).length === 0 ? (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 relative">
                  <div className="absolute inset-0 bg-gray-200 rounded-full animate-ping opacity-20" />
                  <Users className="h-8 w-8 text-gray-300 relative z-10" />
                </div>
                <h3 className="text-[13px] font-black text-gray-500 mb-1">
                  {showOnlyOnline ? 'لا يوجد متصلون حالياً' : 'لا توجد جهات اتصال'}
                </h3>
                <p className="text-[10px] text-gray-400 font-bold max-w-[160px]">
                  {showOnlyOnline ? 'سيظهر أصدقاؤك هنا بمجرد اتصالهم' : 'يمكنك العثور على أصدقائك باستخدام رقم التعريف الخاص بهم'}
                </p>
                {showOnlyOnline && (
                  <Button 
                    variant="link" 
                    className="mt-3 text-blue-500 font-black text-[10px] h-auto p-0"
                    onClick={() => setShowOnlyOnline(false)}
                  >
                    عرض جميع الجهات
                  </Button>
                )}
              </div>
            ) : (
              contacts
                .filter(u => showOnlyOnline ? u.isOnline : true)
                .map((u) => (
                <motion.div
                  key={u.uid}
                  variants={{
                    hidden: { opacity: 0, y: 10, scale: 0.95 },
                    visible: { opacity: 1, y: 0, scale: 1 }
                  }}
                  whileHover={{ 
                    y: -4, 
                    boxShadow: "0 15px 30px -10px rgba(59, 130, 246, 0.3)" 
                  }}
                  className="group relative bg-white rounded-[24px] p-4 border border-blue-50 shadow-[0_8px_20px_-4px_rgba(59,130,246,0.1)] hover:border-blue-200 transition-all duration-300 overflow-hidden"
                >
                  <div className="flex flex-row sm:flex-col items-center gap-4 sm:gap-0 sm:text-center relative z-10">
                    <div className="relative mb-0 sm:mb-4 shrink-0">
                      <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <Avatar className="h-14 w-14 sm:h-16 sm:w-16 border-2 border-white shadow-lg ring-2 ring-blue-50/50 group-hover:ring-blue-100 transition-all duration-500 relative z-10">
                        <AvatarImage src={u.photoURL} className="object-cover" />
                        <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-400 text-white font-black text-xl">
                          {u.displayName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-5 w-5 border-2 border-white rounded-full shadow-md flex items-center justify-center z-20",
                        u.isOnline ? "bg-green-500" : "bg-gray-300"
                      )}>
                        {u.isOnline && <div className="h-2 w-2 bg-white rounded-full animate-pulse" />}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0 sm:w-full">
                      <h3 className="font-black text-gray-900 group-hover:text-blue-600 transition-colors tracking-tight truncate text-sm mb-0.5">
                        {u.displayName}
                      </h3>
                      
                      <div className="flex items-center gap-1.5 justify-start sm:justify-center mb-0 sm:mb-3">
                        {u.isOnline ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest animate-pulse">متصل الآن</span>
                          </div>
                        ) : u.lastSeen && (
                          <div className="flex items-center gap-1 opacity-60">
                            <Clock className="h-2.5 w-2.5 text-gray-400" />
                            <span className="text-[9px] font-bold text-gray-400">
                              آخر ظهور {formatDistanceToNow(typeof (u.lastSeen as any).toDate === 'function' ? (u.lastSeen as any).toDate() : new Date(u.lastSeen), { addSuffix: true, locale: ar })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0 sm:w-full">
                       <Button 
                        size="sm"
                        className="h-9 sm:flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-[10px] px-3 sm:px-0"
                        onClick={() => handleStartChat(u)}
                      >
                        <MessageSquare className="h-3.5 w-3.5 ml-1.5" />
                        مراسلة
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger className="h-9 w-9 rounded-xl bg-gray-50 hover:bg-white flex items-center justify-center text-gray-400 hover:text-blue-600 transition-all border border-gray-100 shadow-sm shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl p-1.5 min-w-[140px] shadow-huge border-gray-100" dir="rtl">
                          <DropdownMenuItem className="rounded-lg p-2 gap-2.5 cursor-pointer focus:bg-blue-50 focus:text-blue-600">
                            <Users className="h-4 w-4" />
                            <span className="text-xs font-bold">الملف</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="rounded-lg p-2 gap-2.5 cursor-pointer focus:bg-red-50 focus:text-red-500"
                            onClick={() => setContactToDelete(u)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="text-xs font-bold">حذف</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!contactToDelete} onOpenChange={() => setContactToDelete(null)}>
        <DialogContent className="rounded-[32px] overflow-hidden border-none p-0 max-w-sm" dir="rtl">
          <div className="bg-red-50 p-8 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6 ring-8 ring-red-50">
              <ShieldAlert className="h-8 w-8 text-red-600" />
            </div>
            <DialogHeader className="p-0 space-y-2">
              <DialogTitle className="text-xl font-black text-red-900 text-center">تأكيد الحذف</DialogTitle>
              <DialogDescription className="text-red-700/70 font-bold text-sm text-center">
                هل أنت متأكد من رغبتك في حذف <span className="text-red-900">"{contactToDelete?.displayName}"</span> من جهات اتصالك؟ لا يمكن التراجع عن هذا الإجراء لاحقاً.
              </DialogDescription>
            </DialogHeader>
          </div>
          <DialogFooter className="p-4 gap-2 sm:gap-0 bg-white sm:flex-row-reverse border-t border-gray-50">
            <Button 
              className="flex-1 h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-70"
              onClick={() => contactToDelete && removeContact(contactToDelete.uid)}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الحذف...
                </>
              ) : (
                'نعم، حذف الآن'
              )}
            </Button>
            <Button 
              variant="ghost" 
              className="flex-1 h-12 rounded-2xl font-bold text-gray-500 hover:bg-gray-100"
              onClick={() => setContactToDelete(null)}
              disabled={deleting}
            >
              تراجع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
