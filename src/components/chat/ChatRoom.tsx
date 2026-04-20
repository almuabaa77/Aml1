import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, increment, writeBatch, setDoc, deleteDoc } from 'firebase/firestore';
import { Message, UserProfile, Chat, Block } from '../../types';
import { Button, buttonVariants } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ArrowRight, Send, Phone, Video, MoreVertical, Paperclip, Trash2, Check, CheckCheck, Loader2, ChevronDown, Edit3, X, EyeOff, Smile, ShieldAlert, Lock, BellRing, Mic, Pin } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../ui/context-menu';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toast } from 'sonner';
import { getAIResponse, getSmartReplies } from '../../services/geminiService';
import { cn } from '../../lib/utils';
import { Sparkles as SparklesIcon, Timer } from 'lucide-react';
import { CountdownTimer } from '../common/CountdownTimer';

interface ChatRoomProps {
  chatId: string;
  onClose: () => void;
  isEmbedded?: boolean;
}

const COMMON_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

export const ChatRoom: React.FC<ChatRoomProps> = ({ chatId, onClose, isEmbedded = false }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [chat, setChat] = useState<Chat | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editValue, setEditValue] = useState('');
  const [blockInfo, setBlockInfo] = useState<{ blockedByOther: any, blockedByUser: any } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { user, profile } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialLoad = useRef(true);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const notificationSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const soundUrl = profile?.notifications?.messageSound || 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3';
    notificationSound.current = new Audio(soundUrl);
    notificationSound.current.volume = 0.5;
  }, [profile?.notifications?.messageSound]);

  useEffect(() => {
    if (!chatId || !user) return;

    // Reset typing status on unmount or chatId change
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setTypingStatus(false);
    };
  }, [chatId, user]);

  useEffect(() => {
    if (!chatId || !user) return;

    // Load Chat details real-time
    const chatUnsubscribe = onSnapshot(doc(db, 'chats', chatId), async (snap) => {
      if (!snap.exists()) return;
      
      const data = snap.data() as Chat;
      const otherUserId = data.participants.find(id => id !== user.uid);
      let otherUser: UserProfile | undefined;
      
      if (otherUserId) {
        // First try to get from user's contacts for performance/consistency
        const contactSnap = await getDoc(doc(db, 'users', user.uid, 'contacts', otherUserId));
        if (contactSnap.exists()) {
          otherUser = contactSnap.data() as UserProfile;
        } else {
          // Fallback to global users collection if not a contact yet
          const userSnap = await getDoc(doc(db, 'users', otherUserId));
          if (userSnap.exists()) {
            otherUser = userSnap.data() as UserProfile;
          }
        }
      }
      
      setChat({ ...data, id: snap.id, otherUser });
    }, (error) => {
      console.error("ChatRoom Details Listener Error:", error);
    });

    // Load Messages
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, async (snap) => {
      const newMessages = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      
      // Play sound for new incoming messages after initial load
      if (!initialLoad.current) {
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.senderId !== user.uid) {
          notificationSound.current?.play().catch(() => {
            // Browser might block autoplay until first interaction
            console.log('Interaction needed for sound');
          });
        }
      }

      // Mark unread messages from others as read when in view
      const unreadFromOthers = snap.docs.filter(d => {
        const data = d.data();
        return data.senderId !== user.uid && !data.read;
      });

      if (unreadFromOthers.length > 0) {
        const batch = writeBatch(db);
        unreadFromOthers.forEach(d => {
          batch.update(d.ref, { read: true });
        });
        
        // Reset unread count for current user and mark last message as read
        batch.update(doc(db, 'chats', chatId), {
          [`unreadCount.${user.uid}`]: 0,
          lastMessageRead: true
        });
        
        await batch.commit();
      }
      
      setMessages(newMessages);
      
      // Improved automatic scrolling
      setTimeout(() => {
        if (scrollContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
          const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
          
          if (isAtBottom || initialLoad.current) {
            scrollContainerRef.current.scrollTo({
              top: scrollHeight,
              behavior: initialLoad.current ? 'auto' : 'smooth'
            });
          } else {
            setShowScrollBottom(true);
          }
        }
      }, 100);

      initialLoad.current = false;
    }, (error) => {
      console.error("ChatRoom Messages Listener Error:", error);
    });

    return () => {
      unsubscribe();
      chatUnsubscribe();
    };
  }, [chatId, user]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    setShowScrollBottom(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // AI Smart Suggestions logic
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.senderId !== user?.uid && lastMsg.type === 'text') {
      const loadSuggestions = async () => {
        setLoadingSuggestions(true);
        try {
          const parts = await getSmartReplies(lastMsg.text);
          setSuggestions(parts);
        } catch (e) {
          setSuggestions(['شكراً لك', 'فهمت', 'ممتاز']);
        } finally {
          setLoadingSuggestions(false);
        }
      };
      loadSuggestions();
    } else {
      setSuggestions([]);
    }
  }, [messages.length, user?.uid]);

  useEffect(() => {
    if (!user || !chat?.otherUser) return;

    const unsubMe = onSnapshot(doc(db, 'users', user.uid, 'blocks', chat.otherUser.uid), (snap) => {
      setBlockInfo(prev => ({ ...prev, blockedByUser: snap.exists() ? snap.data() : null }));
    });

    const unsubOther = onSnapshot(doc(db, 'users', chat.otherUser.uid, 'blocks', user.uid), (snap) => {
      setBlockInfo(prev => ({ ...prev, blockedByOther: snap.exists() ? snap.data() : null }));
    });

    return () => {
      unsubMe();
      unsubOther();
    };
  }, [user, chat?.otherUser?.uid]);

  const sendUnblockRequest = async () => {
    if (!user || !chat?.otherUser || !blockInfo?.blockedByOther) return;
    const currentCount = blockInfo.blockedByOther.unblockRequestCount || 0;
    
    if (currentCount >= 2) {
      toast.error('لقد استنفدت محاولات إرسال الإشعارات');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', chat.otherUser.uid, 'blocks', user.uid), {
        unblockRequestCount: increment(1),
        lastRequestAt: serverTimestamp()
      });

      // Send a system-like message or notification
      await addDoc(collection(db, 'notifications'), {
        userId: chat.otherUser.uid,
        fromId: user.uid,
        type: 'unblock_request',
        text: 'أرجوك افتح الحظر أحتاج في شيء مهم جدا',
        createdAt: serverTimestamp()
      });

      toast.success('تم إرسال طلب فك الحظر');
    } catch (error) {
      toast.error('فشل إرسال الطلب');
    }
  };

  const unblockUser = async () => {
    if (!user || !chat?.otherUser) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'blocks', chat.otherUser.uid));
      toast.success('تم فك الحظر عن المستخدم');
    } catch (error) {
      toast.error('فشل فك الحظر');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await sendAudioMessage(base64Audio, recordingTime);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error('فشل الوصول للميكروفون');
      console.error(err);
    }
  };

  const stopRecording = (cancel = false) => {
    if (mediaRecorderRef.current && isRecording) {
      if (cancel) {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      } else {
        mediaRecorderRef.current.stop();
      }
    }
    setIsRecording(false);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
  };

  const sendAudioMessage = async (audioUrl: string, duration: number) => {
    if (!user || !chatId) return;
    const messageData = {
      chatId,
      senderId: user.uid,
      text: 'Audio Message',
      audioUrl,
      duration,
      type: 'audio',
      read: false,
      createdAt: serverTimestamp()
    };
    await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);
    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage: '🎤 رسالة صوتية',
      lastMessageSenderId: user.uid,
      lastMessageRead: false,
      updatedAt: serverTimestamp()
    });
  };

  const handleSend = async (e: React.FormEvent | string) => {
    if (typeof e !== 'string') e.preventDefault();
    if (blockInfo?.blockedByOther || blockInfo?.blockedByUser) return;
    const messageText = typeof e === 'string' ? e : text;
    if (!messageText.trim() || !user || !chatId) return;

    if (typeof e !== 'string') setText('');
    setSuggestions([]);
    
    // Clear typing status immediately
    setIsTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingStatus(false);

    const messageData: any = {
      chatId,
      senderId: user.uid,
      text: messageText,
      type: 'text',
      read: false,
      createdAt: serverTimestamp()
    };

    if (replyingTo) {
      messageData.replyTo = {
        id: replyingTo.id,
        text: replyingTo.text,
        senderId: replyingTo.senderId
      };
      setReplyingTo(null);
    }

    await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);

    const otherUserId = chat?.participants.find(id => id !== user.uid);
    const updateData: any = {
      lastMessage: messageText,
      lastMessageSenderId: user.uid,
      lastMessageRead: false,
      updatedAt: serverTimestamp()
    };

    if (otherUserId) {
      updateData[`unreadCount.${otherUserId}`] = increment(1);
    }

    await updateDoc(doc(db, 'chats', chatId), updateData);
  };

  const summarizeChat = async () => {
    if (messages.length < 3) {
      toast.info('المحادثة قصيرة جداً للتلخيص');
      return;
    }
    setSummarizing(true);
    try {
      const historyText = messages.slice(-20).map(m => `${m.senderId === user?.uid ? 'أنا' : 'الطرف الآخر'}: ${m.text}`).join('\n');
      const prompt = `قم بتلخيص هذه المحادثة بشكل مختصر جداً وودي باللهجة العربية:\n${historyText}`;
      const summary = await getAIResponse(prompt);
      toast('ملخص المحادثة ✨', {
        description: summary,
        duration: 8000,
      });
    } catch (e) {
      toast.error('فشل تلخيص المحادثة');
    } finally {
      setSummarizing(false);
    }
  };

  const setTypingStatus = async (isTyping: boolean) => {
    if (!user || !chatId) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        [`typing.${user.uid}`]: isTyping
      });
    } catch (e) {
      console.error('Error updating typing status', e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    
    // Remote typing indicator
    if (!isTyping && e.target.value.length > 0) {
      setIsTyping(true);
      setTypingStatus(true);
    } else if (e.target.value.length === 0) {
      setIsTyping(false);
      setTypingStatus(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }
    
    // Clear typing status after 3 seconds of inactivity
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      setTypingStatus(false);
    }, 3000);
  };

  const [isCalling, setIsCalling] = useState(false);

  const startCall = async (type: 'audio' | 'video') => {
    if (!user || !chat?.otherUser || isCalling) return;

    // Check if blocked
    if (blockInfo?.blockedByOther) {
      toast.error('لا يمكنك الاتصال بهذا المستخدم حالياً', {
        description: 'لقد قام هذا المستخدم بحظرك.'
      });
      return;
    }

    if (blockInfo?.blockedByUser) {
      toast.error('لا يمكنك الاتصال بمستخدم قمت بحظره', {
        description: 'قم بفك الحظر أولاً من الإعدادات.'
      });
      return;
    }

    // Check if receiver is busy (Already in a call)
    try {
      setIsCalling(true);
      const userSnap = await getDoc(doc(db, 'users', chat.otherUser.uid));
      const userData = userSnap.data() as UserProfile;
      if (userData?.isInCall) {
        toast.error('المستخدم مشغول في مكالمة أخرى حالياً', {
          description: 'يرجى المحاولة مرة أخرى لاحقاً.'
        });
        setIsCalling(false);
        return;
      }
    } catch (e) {
      console.error("Busy Check Error:", e);
      setIsCalling(false);
    }
    
    // Create a call document
    const callId = Math.random().toString(36).substring(7);
    const callData = {
      id: callId,
      callerId: user.uid,
      receiverId: chat.otherUser.uid,
      type,
      status: 'ringing',
      channelId: `call_${Math.random().toString(36).substr(2, 9)}`,
      participants: [user.uid, chat.otherUser.uid],
      createdAt: serverTimestamp(),
      seen: false
    };
    
    try {
      await setDoc(doc(db, 'calls', callId), callData);
    } finally {
      setIsCalling(false);
    }
  };

  const deleteMessage = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'chats', chatId, 'messages', msgId));
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const deleteForMe = async (msgId: string) => {
    if (!user) return;
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', msgId);
      const msgSnap = await getDoc(msgRef);
      if (msgSnap.exists()) {
        const currentDeletedFor = msgSnap.data().deletedFor || [];
        if (!currentDeletedFor.includes(user.uid)) {
          await updateDoc(msgRef, {
            deletedFor: [...currentDeletedFor, user.uid]
          });
        }
      }
    } catch (error) {
      toast.error('فشل الحذف لدي');
    }
  };

  const startEditing = (msg: Message) => {
    setEditingMessage(msg);
    setEditValue(msg.text);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingMessage || !editValue.trim() || editValue === editingMessage.text) {
      cancelEdit();
      return;
    }

    try {
      await updateDoc(doc(db, 'chats', chatId, 'messages', editingMessage.id), {
        text: editValue,
        isEdited: true,
        editedAt: serverTimestamp()
      });
      toast.success('تم تعديل الرسالة');
      cancelEdit();
    } catch (error) {
      toast.error('فشل تعديل الرسالة');
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
    try {
      const msgSnap = await getDoc(msgRef);
      if (msgSnap.exists()) {
        const reactions = msgSnap.data().reactions || {};
        const uids = reactions[emoji] || [];
        
        if (uids.includes(user.uid)) {
          reactions[emoji] = uids.filter((id: string) => id !== user.uid);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...uids, user.uid];
        }
        
        await updateDoc(msgRef, { reactions });
      }
    } catch (e) {
      console.error("Reaction Error:", e);
    }
  };

  const filteredMessages = messages.filter(m => !m.deletedFor?.includes(user?.uid || ''));

  return (
    <motion.div
      initial={isEmbedded ? { opacity: 0 } : { y: '100%' }}
      animate={isEmbedded ? { opacity: 1 } : { y: 0 }}
      exit={isEmbedded ? { opacity: 0 } : { y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={cn(
        "bg-slate-50 flex flex-col h-full",
        isEmbedded ? "relative z-0" : "fixed inset-0 z-[60]"
      )}
    >
      {/* Header */}
      <header className={cn(
        "h-16 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-3 flex items-center justify-between shadow-sm sticky top-0 z-40",
        isEmbedded && "bg-white/50"
      )}>
        <div className="flex items-center gap-2">
          {!isEmbedded && (
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl hover:bg-gray-100 h-9 w-9">
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}
          <div className="relative group cursor-pointer" onClick={() => toast.info('ملف المستخدم', { description: chat?.otherUser?.displayName })}>
            <Avatar className="h-9 w-9 border-2 border-white shadow-sm ring-2 ring-transparent group-hover:ring-accent-primary/20 transition-all">
              <AvatarImage src={chat?.otherUser?.photoURL} className="object-cover" />
              <AvatarFallback className="bg-blue-100 text-blue-600 font-bold text-xs">{chat?.otherUser?.displayName?.[0]}</AvatarFallback>
            </Avatar>
            {chat?.otherUser?.isOnline && (
              <div className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-green-500 border-2 border-white rounded-full shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="font-black text-gray-900 truncate max-w-[120px] leading-tight text-[15px] tracking-tight">
              {chat?.otherUser?.displayName || '...'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
               {chat?.otherUser?.isOnline ? (
                 <>
                   <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                   <span className="text-[9px] font-black uppercase tracking-widest text-green-500">نشط الآن</span>
                 </>
               ) : (
                 <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">غير متصل</span>
               )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="group rounded-xl text-accent-primary h-9 w-9 bg-accent-primary/5 hover:bg-accent-primary hover:text-white transition-all shadow-sm" onClick={() => startCall('audio')}>
            <Phone className="h-4 w-4 transition-transform group-hover:scale-110" />
          </Button>
          <Button variant="ghost" size="icon" className="group rounded-xl text-accent-primary h-9 w-9 bg-accent-primary/5 hover:bg-accent-primary hover:text-white transition-all shadow-sm" onClick={() => startCall('video')}>
            <Video className="h-4 w-4 transition-transform group-hover:scale-110" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-2xl text-gray-400 h-11 w-11 hover:bg-gray-100 flex items-center justify-center transition-all outline-none">
              <MoreVertical className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-[24px] p-2 border-gray-100 shadow-huge">
              <DropdownMenuItem 
                onClick={summarizeChat}
                className="rounded-xl flex items-center justify-between p-3 focus:bg-blue-50 focus:text-blue-600 gap-6 cursor-pointer"
                disabled={summarizing}
              >
                <div className="flex items-center gap-2">
                  <SparklesIcon className={cn("h-4 w-4", summarizing && "animate-spin")} />
                  <span className="font-bold text-sm">تلخيص المحادثة (الذكاء)</span>
                </div>
                {summarizing && <Loader2 className="h-3 w-3 animate-spin" />}
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="rounded-xl flex items-center p-3 focus:bg-orange-50 focus:text-orange-500 gap-2 cursor-pointer"
                onClick={() => {
                  const backgrounds: ('grad-1' | 'grad-2' | 'grad-3' | 'grad-4' | 'mesh-1')[] = ['grad-1', 'grad-2', 'grad-3', 'grad-4', 'mesh-1'];
                  const current = profile?.appearance?.chatBackground || 'slate-50';
                  const nextIdx = (backgrounds.indexOf(current as any) + 1) % backgrounds.length;
                  const nextBg = backgrounds[nextIdx];
                  
                  if (user?.uid) {
                    updateDoc(doc(db, 'users', user.uid), {
                      'appearance.chatBackground': nextBg
                    });
                    toast.success('تم تغيير خلفية الدردشة');
                  }
                }}
              >
                <Smile className="h-4 w-4" />
                <span className="font-bold text-sm">تغيير الخلفية</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="rounded-xl flex items-center p-3 focus:bg-red-50 focus:text-red-500 gap-2 cursor-pointer"
                onClick={onClose}
              >
                <ArrowRight className="h-4 w-4" />
                <span className="font-bold text-sm text-red-500">إغلاق المحادثة</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Pinned Message Bar */}
      <AnimatePresence>
        {chat?.pinnedMessageId && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-2 flex items-center justify-between z-30 shadow-sm"
          >
             <div className="flex items-center gap-3 min-w-0" onClick={() => {
               const msgEl = document.getElementById(`msg-${chat.pinnedMessageId}`);
               if (msgEl) msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
             }}>
                <div className="w-1 h-8 bg-blue-500 rounded-full" />
                <div className="min-w-0">
                   <div className="flex items-center gap-1.5">
                      <Pin className="h-3 w-3 text-blue-500 fill-current" />
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">رسالة مثبتة</span>
                   </div>
                   <p className="text-[12px] font-bold text-gray-600 truncate">{chat.pinnedMessageText}</p>
                </div>
             </div>
             <Button 
               variant="ghost" 
               size="icon" 
               className="h-8 w-8 rounded-full hover:bg-gray-100"
               onClick={async () => {
                 if (!chatId) return;
                 await updateDoc(doc(db, 'chats', chatId), {
                   pinnedMessageId: null,
                   pinnedMessageText: null
                 });
                 toast.success('تم إزالة التثبيت');
               }}
              >
                <X className="h-4 w-4 text-gray-400" />
             </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 relative overflow-hidden">
        <ScrollArea 
          className={cn(
            "h-full px-4 py-6 transition-colors duration-500",
            profile?.appearance?.chatBackground === 'grad-1' ? 'bg-gradient-to-br from-blue-50 to-indigo-50' :
            profile?.appearance?.chatBackground === 'grad-2' ? 'bg-gradient-to-br from-emerald-50 to-teal-50' :
            profile?.appearance?.chatBackground === 'grad-3' ? 'bg-gradient-to-br from-purple-50 to-pink-50' :
            profile?.appearance?.chatBackground === 'grad-4' ? 'bg-gradient-to-br from-orange-50 to-rose-50' :
            profile?.appearance?.chatBackground === 'mesh-1' ? 'bg-[#f8faff] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]' :
            'bg-slate-50'
          )} 
          ref={scrollRef}
          onScrollCapture={handleScroll}
          viewportRef={scrollContainerRef}
        >
          <div className="flex flex-col gap-4 pb-4">
            {messages.length === 0 && !initialLoad.current && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="relative mb-6">
                  <div className="absolute inset-[-15px] bg-blue-100/50 rounded-full blur-2xl animate-pulse" />
                  <Avatar className="h-20 w-20 border-4 border-white shadow-2xl relative z-10 transition-transform hover:scale-110">
                    <AvatarImage src={chat?.otherUser?.photoURL} />
                    <AvatarFallback className="bg-blue-600 text-white text-2xl font-black">
                      {chat?.otherUser?.displayName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-2 -right-2 bg-blue-500 p-2 rounded-2xl border-4 border-white shadow-lg">
                    <SparklesIcon className="h-4 w-4 text-white" />
                  </div>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-1 tracking-tight">
                   ابدأ دردشة رائعة مع {chat?.otherUser?.displayName?.split(' ')[0]}
                </h3>
                <p className="text-[10px] font-black uppercase text-secondary-text tracking-[0.25em] opacity-60">
                  End-to-End Encrypted Communication
                </p>
                
                <div className="mt-8 grid grid-cols-2 gap-3 w-full max-w-xs px-4">
                  <div className="p-3 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-100 flex flex-col items-center gap-1">
                     <Lock className="h-4 w-4 text-green-500" />
                     <span className="text-[9px] font-bold text-gray-500">حماية فائقة</span>
                  </div>
                  <div className="p-3 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-100 flex flex-col items-center gap-1">
                     <Timer className="h-4 w-4 text-blue-500" />
                     <span className="text-[9px] font-bold text-gray-500">مزامنة سريعة</span>
                  </div>
                </div>
              </motion.div>
            )}
            {Array.isArray(filteredMessages) && filteredMessages.map((msg, idx) => {
              const isMe = msg.senderId === user?.uid;
              const prevMsg = filteredMessages[idx - 1];
              const nextMsg = filteredMessages[idx + 1];
              const showTime = !prevMsg || (msg.createdAt?.seconds - prevMsg.createdAt?.seconds > 300);
              
              const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId && (msg.createdAt?.seconds - prevMsg.createdAt?.seconds < 60);
              const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId || (nextMsg.createdAt?.seconds - msg.createdAt?.seconds > 60);

              return (
                <React.Fragment key={msg.id}>
                  {showTime && msg.createdAt && (
                    <div className="text-center my-6 flex items-center gap-4">
                      <div className="flex-1 h-[1px] bg-gray-100" />
                      <span className="text-[10px] bg-white border border-gray-100 text-gray-400 px-3 py-1 rounded-full uppercase font-black tracking-widest shadow-sm">
                        {format(msg.createdAt.toDate(), 'p', { locale: ar })}
                      </span>
                      <div className="flex-1 h-[1px] bg-gray-100" />
                    </div>
                  )}
                  <div id={`msg-${msg.id}`} className={cn(
                    "flex w-full items-end gap-1.5 group transition-all",
                    isMe ? 'justify-start' : 'justify-end',
                    isConsecutive ? '-mt-3' : 'mt-1'
                  )}>
                    {!isMe && !isConsecutive && (
                      <Avatar className="h-8 w-8 border border-white shadow-sm shrink-0 mb-1">
                        <AvatarImage src={chat?.otherUser?.photoURL} />
                        <AvatarFallback className="bg-blue-100 text-blue-600 text-[10px] font-bold">{chat?.otherUser?.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                    )}
                    {!isMe && isConsecutive && <div className="w-8 shrink-0" />}

                    <ContextMenu>
                      <ContextMenuTrigger 
                        className={cn(
                          "max-w-[85%] p-3 shadow-sm relative transition-all group-hover:shadow-lg cursor-default select-none touch-none",
                          profile?.appearance?.bubbleStyle === 'glass' 
                            ? (isMe ? "bg-accent-primary/80 backdrop-blur-md text-white border border-white/20" : "bg-white/40 backdrop-blur-md text-gray-800 border border-white/40")
                            : profile?.appearance?.bubbleStyle === 'classic'
                            ? (isMe ? "bg-accent-primary text-white" : "bg-white text-gray-800 border-b border-gray-100")
                            : (isMe ? "bg-gradient-to-br from-accent-primary to-accent-secondary text-white hover:shadow-accent-primary/20" : "bg-white text-gray-800 border border-gray-100 hover:shadow-gray-200"),
                          profile?.appearance?.bubbleStyle !== 'classic' && (
                            isMe ? (isLastInGroup ? "rounded-2xl rounded-br-none" : "rounded-2xl rounded-br-md") 
                                 : (isLastInGroup ? "rounded-2xl rounded-bl-none" : "rounded-2xl rounded-bl-md")
                          )
                        )}
                        onTouchStart={(e) => {
                          // Long press logic for mobile
                          const target = e.currentTarget;
                          const timer = setTimeout(() => {
                            const event = new MouseEvent('contextmenu', {
                              bubbles: true,
                              cancelable: true,
                              view: window,
                              button: 2,
                              buttons: 2,
                              clientX: e.touches[0].clientX,
                              clientY: e.touches[0].clientY
                            });
                            target.dispatchEvent(event);
                          }, 500);
                          target.setAttribute('data-long-press-timer', timer.toString());
                        }}
                        onTouchEnd={(e) => {
                          const timer = e.currentTarget.getAttribute('data-long-press-timer');
                          if (timer) clearTimeout(parseInt(timer));
                        }}
                        onTouchMove={(e) => {
                          const timer = e.currentTarget.getAttribute('data-long-press-timer');
                          if (timer) clearTimeout(parseInt(timer));
                        }}
                      >
                        <motion.div
                          initial={initialLoad.current ? false : { opacity: 0, scale: 0.8, y: 10, x: isMe ? 15 : -15 }}
                          animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                        >
                          {/* Reply Preview in Message */}
                          {msg.replyTo && (
                            <div className={cn(
                              "mb-2 p-2 rounded-lg text-[10px] border-r-4 border-accent-primary bg-black/5 flex flex-col gap-0.5",
                              !isMe && "bg-gray-100"
                            )}>
                               <span className="font-black opacity-60">
                                 {msg.replyTo.senderId === user?.uid ? 'أنت' : chat?.otherUser?.displayName}
                               </span>
                               <p className="truncate opacity-80">{msg.replyTo.text}</p>
                            </div>
                          )}

                          {msg.type === 'audio' ? (
                          <div className="flex items-center gap-3 py-1 min-w-[200px]">
                            <div 
                              role="button"
                              tabIndex={0}
                              className={cn(
                                "h-10 w-10 rounded-full shrink-0 shadow-sm flex items-center justify-center cursor-pointer active:scale-95 transition-all outline-none",
                                isMe ? "bg-white/20 hover:bg-white/30 text-white" : "bg-blue-50 hover:bg-blue-100 text-blue-600"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                const audio = new Audio(msg.audioUrl);
                                audio.play();
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  const audio = new Audio(msg.audioUrl);
                                  audio.play();
                                }
                              }}
                            >
                              <Phone className="h-5 w-5 fill-current" />
                            </div>
                            <div className="flex-1 flex flex-col gap-1">
                               <div className="flex items-center gap-1">
                                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                                    <div 
                                      key={i} 
                                      className={cn(
                                        "w-1 rounded-full",
                                        isMe ? "bg-white/40" : "bg-blue-200",
                                        i % 3 === 0 ? "h-4" : i % 2 === 0 ? "h-2" : "h-3"
                                      )} 
                                    />
                                  ))}
                               </div>
                               <span className={cn("text-[9px] font-black", isMe ? "text-white/60" : "text-gray-400")}>
                                 {Math.floor((msg.duration || 0) / 60)}:{(msg.duration || 0) % 60 < 10 ? '0' : ''}{(msg.duration || 0) % 60}
                               </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[13px] leading-snug font-medium whitespace-pre-wrap">{msg.text}</p>
                        )}
                          
                          <div className={`flex items-center gap-1 mt-1 justify-end ${isMe ? 'text-white/60' : 'text-gray-400'}`}>
                            {msg.isEdited && (
                              <span className="text-[7px] font-black uppercase ml-1 opacity-70">معدلة</span>
                            )}
                            {msg.createdAt && (
                              <span className="text-[8px] font-bold">
                                {format(msg.createdAt.toDate(), 'HH:mm')}
                              </span>
                            )}
                            {isMe && (
                              msg.read ? (
                                <CheckCheck className="h-2.5 w-2.5 text-white/90" />
                              ) : (
                                <Check className="h-2.5 w-2.5 text-white/50" />
                              )
                            )}
                          </div>

                          {/* Reactions Display */}
                          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                            <div className={cn(
                              "absolute -bottom-3 flex gap-1 z-10",
                              isMe ? 'right-2' : 'left-2'
                            )}>
                              {Object.entries(msg.reactions).map(([emoji, uids]) => (
                                <motion.button
                                  key={emoji}
                                  initial={{ scale: 0, y: 5 }}
                                  animate={{ scale: 1, y: 0 }}
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); }}
                                  className={cn(
                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-black border shadow-premium transition-all bg-white/90 backdrop-blur-md",
                                    uids.includes(user?.uid || '') ? "border-blue-500 text-blue-600 ring-2 ring-blue-500/10" : "border-gray-100 text-gray-500 hover:border-gray-200"
                                  )}
                                >
                                  <span className="leading-none">{emoji}</span>
                                  {uids.length > 1 && <span className="text-[9px] opacity-70">{uids.length}</span>}
                                </motion.button>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="rounded-3xl p-2 border-gray-100 shadow-huge min-w-[240px] animate-in fade-in zoom-in duration-200" dir="rtl">
                        <div className="flex justify-between items-center p-2.5 mb-2 bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-[20px] backdrop-blur-md">
                          {COMMON_EMOJIS.map(emoji => (
                            <button 
                              key={emoji} 
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className="hover:scale-150 transform transition-all text-xl p-1.5 active:scale-90 hover:drop-shadow-sm"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        
                        <div className="space-y-0.5">
                          <ContextMenuItem 
                            className="rounded-2xl flex items-center p-3 gap-3 cursor-pointer focus:bg-accent-primary/5 focus:text-accent-primary group outline-none"
                            onClick={() => setReplyingTo(msg)}
                          >
                            <div className="h-8 w-8 rounded-xl bg-accent-primary/5 flex items-center justify-center group-focus:bg-accent-primary/10 transition-colors">
                              <ArrowRight className="h-4 w-4 rotate-180 group-hover:translate-x-[-2px] transition-transform" />
                            </div>
                            <span className="font-bold text-sm">رد على الرسالة</span>
                          </ContextMenuItem>
                          
                          <ContextMenuItem 
                            className="rounded-2xl flex items-center p-3 gap-3 cursor-pointer focus:bg-blue-50 focus:text-blue-700 group outline-none"
                            onClick={async () => {
                              if (!chatId) return;
                              await updateDoc(doc(db, 'chats', chatId), {
                                pinnedMessageId: msg.id,
                                pinnedMessageText: msg.text
                              });
                              toast.success('تم تثبيت الرسالة في الأعلى');
                            }}
                          >
                            <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center group-focus:bg-blue-100 transition-colors text-blue-600">
                              <Pin className="h-4 w-4" />
                            </div>
                            <span className="font-bold text-sm">تثبيت في المحادثة</span>
                          </ContextMenuItem>

                          {isMe && (
                            <ContextMenuItem 
                              className="rounded-2xl flex items-center p-3 gap-3 cursor-pointer focus:bg-amber-50 focus:text-amber-700 group outline-none"
                              onClick={() => startEditing(msg)}
                            >
                              <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center group-focus:bg-amber-100 transition-colors text-amber-600">
                                <Edit3 className="h-4 w-4" />
                              </div>
                              <span className="font-bold text-sm">تعديل الرسالة</span>
                            </ContextMenuItem>
                          )}

                          <div className="h-px bg-gray-50 my-1 mx-2" />

                          <ContextMenuItem 
                            className="rounded-2xl flex items-center p-3 gap-3 cursor-pointer focus:bg-gray-50 focus:text-gray-900 group outline-none"
                            onClick={() => deleteForMe(msg.id)}
                          >
                            <div className="h-8 w-8 rounded-xl bg-gray-50 flex items-center justify-center group-focus:bg-gray-100 transition-colors text-gray-500">
                              <EyeOff className="h-4 w-4" />
                            </div>
                            <span className="font-medium text-sm">حذف لدي فقط</span>
                          </ContextMenuItem>

                          {isMe && (
                            <ContextMenuItem 
                              className="rounded-2xl flex items-center p-3 gap-3 cursor-pointer focus:bg-red-50 focus:text-red-600 group outline-none"
                              onClick={() => deleteMessage(msg.id)}
                            >
                              <div className="h-8 w-8 rounded-xl bg-red-50 flex items-center justify-center group-focus:bg-red-100 transition-colors text-red-500">
                                <Trash2 className="h-4 w-4" />
                              </div>
                              <span className="font-bold text-sm">حذف لدى الجميع</span>
                            </ContextMenuItem>
                          )}
                        </div>
                      </ContextMenuContent>
                    </ContextMenu>
                  </div>
                </React.Fragment>
              );
            })}
          
          {/* Real-time Typing Indicator */}
          {chat?.otherUser && chat.typing?.[chat.otherUser.uid] && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 mr-2 mb-4 bg-white/50 backdrop-blur-sm p-2 rounded-2xl w-fit border border-blue-50/50 shadow-sm"
            >
              <div className="flex gap-1.5 px-1">
                <motion.div 
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                  className="w-1.5 h-1.5 bg-accent-primary rounded-full" 
                />
                <motion.div 
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                  className="w-1.5 h-1.5 bg-accent-primary rounded-full" 
                />
                <motion.div 
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                  className="w-1.5 h-1.5 bg-accent-primary rounded-full" 
                />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-accent-primary/60 ml-1">جاري الكتابة...</span>
            </motion.div>
          )}
        </div>
      </ScrollArea>
        
        {/* Scroll to Bottom Button */}
        <AnimatePresence>
          {showScrollBottom && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              onClick={scrollToBottom}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 h-10 w-10 rounded-full bg-white shadow-xl border border-gray-100 flex items-center justify-center text-blue-600 hover:scale-110 active:scale-95 transition-all group"
            >
              <ChevronDown className="h-6 w-6" />
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 border-2 border-white rounded-full animate-pulse" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Area */}
      <footer className="p-3 bg-white border-t border-gray-100 flex flex-col gap-2 relative z-50 shadow-2xl">
        <AnimatePresence mode="wait">
          {suggestions.length > 0 && !text.trim() && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full left-0 right-0 p-3 bg-white/60 backdrop-blur-xl border-t border-gray-100 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth shadow-sm"
            >
              <div className="flex items-center gap-1.5 px-2 text-accent-primary shrink-0">
                <SparklesIcon className="h-4 w-4 animate-premium-float" />
                <span className="text-[10px] font-black uppercase tracking-tighter">رد ذكي</span>
              </div>
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(suggestion)}
                  className="px-4 py-1.5 bg-white hover:bg-accent-primary/5 text-accent-primary rounded-full text-[11px] font-black whitespace-nowrap transition-all border border-accent-primary/10 shadow-sm flex items-center gap-2 group/s active:scale-95"
                >
                  <Send className="h-3 w-3 opacity-0 -translate-x-2 group-hover/s:opacity-100 group-hover/s:translate-x-0 transition-all rotate-180" />
                  {suggestion}
                </button>
              ))}
            </motion.div>
          )}

          {replyingTo && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-gray-50/80 backdrop-blur-sm p-3 rounded-t-[20px] border-t border-gray-100 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-1.5 h-10 bg-accent-primary rounded-full shadow-lg shadow-accent-primary/20" />
                <div className="min-w-0">
                  <p className="text-[9px] font-black text-accent-primary uppercase tracking-widest leading-none mb-1.5">الرد على {replyingTo.senderId === user?.uid ? 'نفسك' : chat?.otherUser?.displayName}</p>
                  <p className="text-[12px] text-gray-500 truncate font-bold leading-none">{replyingTo.text}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setReplyingTo(null)} className="rounded-full h-8 w-8 hover:bg-gray-200 transition-all">
                <X className="h-4 w-4 text-gray-400" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {blockInfo?.blockedByUser ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 p-4 bg-white rounded-3xl border border-red-100 shadow-xl shadow-red-500/5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
            <div className="flex items-center gap-2 w-full">
              <div className="h-10 w-10 bg-red-50 rounded-2xl flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-black text-gray-900 leading-tight">لقد قمت بحظر {chat?.otherUser?.displayName?.split(' ')[0]}</p>
                <p className="text-[10px] text-gray-400 font-bold">لن تصلك أي رسائل أو مكالمات من هذا الطرف.</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={unblockUser}
                className="rounded-xl bg-blue-50 text-blue-600 font-black text-[10px] h-9 px-4 hover:bg-blue-100"
              >
                فك الحظر
              </Button>
            </div>
          </motion.div>
        ) : blockInfo?.blockedByOther ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 p-5 bg-white rounded-3xl border border-gray-100 shadow-2xl relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-gray-200 group-hover:bg-red-500 transition-colors" />
            <div className="w-16 h-16 bg-gray-50 rounded-[2rem] flex items-center justify-center relative shadow-inner">
               <Lock className="h-8 w-8 text-gray-300" />
               <motion.div 
                 animate={{ scale: [1, 1.1, 1] }}
                 transition={{ repeat: Infinity, duration: 2 }}
                 className="absolute -bottom-1 -right-1 bg-red-500 h-6 w-6 rounded-full border-4 border-white flex items-center justify-center"
               >
                 <EyeOff className="h-3 w-3 text-white" />
               </motion.div>
            </div>
            
            <div className="text-center space-y-1">
              <h4 className="text-base font-black text-gray-900 tracking-tight">قنوات التواصل مقيدة حالياً</h4>
              <p className="text-[11px] text-gray-400 font-bold leading-relaxed px-4">
                {blockInfo?.blockedByOther?.expiresAt 
                  ? "المستخدم قام بتقييد المحادثة لفترة زمنية محددة. يرجى الانتظار."
                  : "لا يمكنك إرسال الرسائل إلى هذا المستخدم في الوقت الحالي."
                }
              </p>
            </div>

            {blockInfo?.blockedByOther?.expiresAt && (
              <div className="flex items-center gap-2 bg-red-50 px-4 py-2 rounded-2xl border border-red-100">
                 <Timer className="h-3.5 w-3.5 text-red-500 animate-pulse" />
                 <CountdownTimer 
                   expiresAt={blockInfo.blockedByOther.expiresAt} 
                   className="text-[11px] font-black text-red-600"
                   showIcon={false}
                 />
              </div>
            )}
            
            <Button 
              onClick={sendUnblockRequest}
              disabled={(blockInfo.blockedByOther.unblockRequestCount || 0) >= 2}
              className={cn(
                "w-full h-11 rounded-2xl flex items-center justify-center gap-2 font-black text-xs transition-all tracking-tight",
                (blockInfo.blockedByOther.unblockRequestCount || 0) >= 2
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100"
              )}
            >
              <BellRing className="h-4 w-4" />
              <span>إرسال تنبيه فك الحظر ({2 - (blockInfo.blockedByOther.unblockRequestCount || 0)} متبقي)</span>
            </Button>
            <p className="text-[9px] font-black uppercase text-gray-300 tracking-[0.3em]">Restricted Interaction Interface</p>
          </motion.div>
        ) : editingMessage ? (
          <form 
            onSubmit={(e) => { e.preventDefault(); saveEdit(); }}
            className="flex items-center gap-2 bg-accent-primary/5 p-1.5 rounded-[20px] border border-accent-primary/20"
          >
            <Button type="button" variant="ghost" size="icon" onClick={cancelEdit} className="rounded-full text-gray-400 hover:text-red-500 h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
            <div className="flex-1 flex flex-col px-1.5">
              <span className="text-[8px] font-black text-accent-primary uppercase mb-0.5">تعديل الرسالة</span>
              <Input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="bg-transparent border-none h-6 p-0 text-xs font-bold focus-visible:ring-0"
              />
            </div>
            <Button 
              type="submit" 
              size="icon" 
              className="rounded-full bg-accent-primary hover:opacity-90 text-white h-8 w-8 shadow-md"
            >
              <Check className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSend} className="flex items-end gap-2 bg-gray-50 rounded-[28px] p-1.5 border border-gray-100 shadow-inner group-focus-within:border-blue-200 transition-all">
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), "rounded-2xl text-gray-400 hover:text-blue-500 hover:bg-white h-11 w-11 shrink-0 transition-all shadow-sm bg-white/50 border border-transparent hover:border-blue-50 ring-0 outline-none flex items-center justify-center")}>
                <Paperclip className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="rounded-[24px] p-2 border-gray-100 shadow-huge w-56 mb-2">
                <DropdownMenuItem className="rounded-xl flex items-center p-3 gap-3 cursor-pointer focus:bg-blue-50 focus:text-blue-600">
                  <div className="h-9 w-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                    <Paperclip className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">مستند</span>
                    <span className="text-[10px] text-gray-400">ملفات PDF, DOC...</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-xl flex items-center p-3 gap-3 cursor-pointer focus:bg-emerald-50 focus:text-emerald-600" onClick={() => toast.info('مشاركة الموقع', { description: 'سيتم إرسال موقعك الحالي' })}>
                  <div className="h-9 w-9 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                    <ArrowRight className="h-4 w-4 rotate-45" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">الموقع</span>
                    <span className="text-[10px] text-gray-400">أرسل مكان تواجدك</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-xl flex items-center p-3 gap-3 cursor-pointer focus:bg-orange-50 focus:text-orange-600">
                  <div className="h-9 w-9 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="bg-orange-200" />
                    </Avatar>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">جهة اتصال</span>
                    <span className="text-[10px] text-gray-400">شارك رقم صديق</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <div className="flex-1 relative group py-2 px-1">
              <AnimatePresence>
                {isRecording && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="absolute inset-0 z-10 bg-gray-50 rounded-2xl flex items-center px-4 gap-3"
                  >
                    <div className="flex gap-1.5 items-center">
                       <motion.div 
                         initial={{ scale: 0.8 }}
                         animate={{ scale: [0.8, 1.2, 0.8] }}
                         transition={{ repeat: Infinity, duration: 1.5 }}
                         className="h-2 w-2 bg-red-500 rounded-full"
                       />
                      {[1,2,3,4,5,6].map(i => (
                        <motion.div 
                          key={i}
                          animate={{ height: [4, Math.random() * 16 + 4, 4] }}
                          transition={{ repeat: Infinity, duration: 0.2, delay: i * 0.05 }}
                          className="w-1 bg-blue-500 rounded-full"
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest bg-white px-2 py-0.5 rounded-lg shadow-sm border border-gray-100">
                      {Math.floor(recordingTime / 60)}:{recordingTime % 60 < 10 ? '0' : ''}{recordingTime % 60}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => stopRecording(true)} className="text-[9px] font-black text-red-500 uppercase h-6 hover:bg-red-50 rounded-lg">إلغاء</Button>
                    <Button variant="ghost" size="sm" onClick={() => stopRecording(false)} className="text-[9px] font-black text-green-500 uppercase h-6 hover:bg-green-50 rounded-lg">إرسال</Button>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <Input
                placeholder="اكتب رسالة..."
                value={text}
                onChange={handleInputChange}
                className="bg-transparent border-none focus-visible:ring-0 text-sm font-bold min-h-[44px] h-auto p-0 placeholder:text-gray-300"
                dir="rtl"
              />
            </div>

            <div className="flex items-center gap-1 shrink-0">
               <AnimatePresence mode="wait">
                 {text.trim() || replyingTo ? (
                   <div className="flex items-center gap-1">
                     <motion.div
                       initial={{ scale: 0 }}
                       animate={{ scale: 1 }}
                       exit={{ scale: 0 }}
                     >
                       <Button 
                         type="button" 
                         variant="ghost" 
                         size="icon" 
                         onClick={async () => {
                           if (!text.trim()) return;
                           toast.promise(getAIResponse(`أعد صياغة هذه الرسالة لتكون أكثر تهذيباً واحترافية باللغة العربية: ${text}`), {
                             loading: 'جاري تحسين الرسالة...',
                             success: (data) => {
                               setText(data);
                               return 'تم تحسين الرسالة ✨';
                             },
                             error: 'فشل تحسين الرسالة'
                           });
                         }}
                         className="rounded-2xl text-blue-500 hover:bg-blue-50 h-11 w-11 transition-all"
                       >
                         <SparklesIcon className="h-5 w-5 animate-premium-float" />
                       </Button>
                     </motion.div>
                     <motion.div
                       key="send-btn"
                       initial={{ scale: 0, rotate: -45 }}
                       animate={{ scale: 1, rotate: 0 }}
                       exit={{ scale: 0, rotate: 45 }}
                     >
                       <Button 
                         type="submit" 
                         size="icon" 
                         className="rounded-2xl bg-blue-600 hover:bg-blue-700 text-white h-11 w-11 shadow-lg shadow-blue-200 group/send transition-all"
                       >
                         <Send className="h-5 w-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform rotate-180" />
                       </Button>
                     </motion.div>
                   </div>
                 ) : (
                   <motion.div
                     key="action-btns"
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     className="flex items-center"
                   >
                     <Button type="button" variant="ghost" size="icon" className="rounded-2xl text-gray-400 hover:text-blue-500 h-11 w-11">
                       <Smile className="h-5 w-5" />
                     </Button>
                     <Button 
                       type="button" 
                       variant="ghost" 
                       size="icon" 
                       onClick={startRecording}
                       className="rounded-2xl text-gray-400 hover:text-red-500 h-11 w-11 transition-all"
                     >
                       <Mic className="h-5 w-5" />
                     </Button>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
          </form>
        )}
      </footer>
    </motion.div>
  );
};
