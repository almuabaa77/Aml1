import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, Bot, User, Trash2, MessageSquare, ChevronDown, Video } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { getAIResponse } from '../../services/geminiService';
import { cn } from '../../lib/utils';

interface Message {
  role: 'user' | 'model';
  content: string;
}

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit, setDoc, doc } from 'firebase/firestore';
import { toast } from 'sonner';
import { Tab } from '../layout/BottomNav';

interface AIViewProps {
  onChatSelect?: (id: string | null) => void;
  setActiveTab?: (tab: Tab) => void;
}

export const AIView: React.FC<AIViewProps> = ({ onChatSelect, setActiveTab }) => {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: 'مرحباً! أنا "مساعد مائي" (Aqua Assistant) - رفيقك الذكي في تطبيق تواصل. ✨\n\nكيف يمكنني مساعدتك اليوم؟ يمكنك:\n* 🔍 **البحث عن أشخاص بالرقم المميز (700xxxxxx).**\n* 👫 **العثور على أصدقاء حسب الاسم أو الاهتمامات.**\n* 🛡️ **تأمين حسابك برمز PIN احترافي.**\n* 💎 **تحسين ملفك الشخصي واقتراح نبذة (Bio) مميزة.**' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
      
      if (isAtBottom) {
        scrollContainerRef.current.scrollTo({
          top: scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [messages, loading]);

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

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
      
      const response = await getAIResponse(userMessage, history, user?.uid, { 
        displayName: profile?.displayName || user?.displayName,
        bio: profile?.bio,
        hasPin: !!profile?.security?.pin
      });
      setMessages(prev => [...prev, { role: 'model', content: response }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: 'عذراً، حدث خطأ ما. حاول مرة أخرى.' }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{ role: 'model', content: 'تم مسح المحادثة. كيف يمكنني مساعدتك الآن؟ ✨' }]);
  };

  const handleAIAction = async (action: string, uid: string, label: string) => {
    if (!user) return;
    
    try {
      if (action === 'call') {
        const callId = Math.random().toString(36).substring(7);
        const callData = {
          id: callId,
          callerId: user.uid,
          receiverId: uid,
          type: 'video',
          status: 'ringing',
          channelId: `call_${Math.random().toString(36).substr(2, 9)}`,
          participants: [user.uid, uid],
          createdAt: serverTimestamp(),
          seen: false
        };
        await setDoc(doc(db, 'calls', callId), callData);
        toast.promise(Promise.resolve(), {
          loading: 'جاري الاتصال...',
          success: `جاري الاتصال بـ ${label}...`,
          error: 'فشل بدء المكالمة',
        });
      } else if (action === 'chat') {
        // Find existing chat with this user
        toast.loading('جاري تحويلك للمحادثة...');
        const q = query(
          collection(db, 'chats'),
          where('participants', 'array-contains', user.uid)
        );
        const snap = await getDocs(q);
        const existingChat = snap.docs.find(d => {
          const parts = d.data().participants as string[];
          return parts.includes(uid);
        });

        if (existingChat) {
          onChatSelect?.(existingChat.id);
          setActiveTab?.('chats');
          toast.dismiss();
        } else {
          // Create new chat
          const newChat = await addDoc(collection(db, 'chats'), {
            participants: [user.uid, uid],
            updatedAt: serverTimestamp(),
            lastMessage: ''
          });
          onChatSelect?.(newChat.id);
          setActiveTab?.('chats');
          toast.dismiss();
          toast.success(`بدأت محادثة جديدة مع ${label}`);
        }
      } else if (action === 'friend') {
        const q = query(
          collection(db, `users/${user.uid}/contacts`),
          where('uid', '==', uid)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
          // Get the target user profile first for a complete contact object
          const userQ = query(collection(db, 'users'), where('uid', '==', uid), limit(1));
          const userSnap = await getDocs(userQ);
          if (!userSnap.empty) {
            const targetProfile = userSnap.docs[0].data();
            await setDoc(doc(db, 'users', user.uid, 'contacts', uid), targetProfile);
            toast.success(`تمت إضافة ${label} إلى جهات الاتصال`);
          }
        } else {
          toast.info(`${label} موجود بالفعل في قائمة أصدقائك`);
        }
      }
    } catch (error) {
      console.error("AI Action Error:", error);
      toast.error('حدث خطأ أثناء تنفيذ الإجراء');
    }
  };

  return (
    <div className="h-full flex flex-col bg-transparent relative overflow-hidden">
      {/* Background Decorative Element */}
      <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />

      {/* Messages Area */}
      <div className="flex-1 relative overflow-hidden">
        <ScrollArea 
          className="h-full" 
          ref={scrollRef}
          onScrollCapture={handleScroll}
          viewportRef={scrollContainerRef}
        >
          <div className="flex flex-col gap-5 p-4 sm:p-6 pb-40">
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className={cn(
                "flex items-start gap-2.5 sm:gap-3 max-w-[92%]",
                msg.role === 'user' ? "mr-auto flex-row-reverse" : "ml-auto"
              )}
            >
              <div className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 shadow-premium border-2 border-white",
                msg.role === 'user' ? "bg-white text-gray-400" : "bg-blue-600 text-white"
              )}>
                {msg.role === 'user' ? <User className="h-4 w-4 sm:h-5 sm:w-5" /> : <Bot className="h-4 w-4 sm:h-5 sm:w-5" />}
              </div>
              <div className={cn(
                "p-3.5 sm:p-4 rounded-[22px] sm:rounded-[28px] text-sm sm:text-[15px] leading-relaxed shadow-premium border relative overflow-hidden",
                msg.role === 'user' 
                  ? "bg-white/80 backdrop-blur-md border-white/50 text-gray-800 rounded-tr-none" 
                  : "bg-gradient-to-br from-blue-600 to-indigo-600 border-blue-400/20 text-white rounded-tl-none font-medium"
              )}>
                <div className="markdown-body prose prose-sm max-w-none prose-invert">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    urlTransform={(uri) => uri} // Allow all URIs including custom 'action:' protocol
                    components={{
                      a: ({ node, href, children, ...props }) => {
                        const isAction = href?.startsWith('action:') || href?.includes('action%3A');
                        if (isAction) {
                          const decodedHref = decodeURIComponent(href!);
                          const parts = decodedHref.split(':');
                          if (parts.length >= 3) {
                            const [_, type, uid, ...labelParts] = parts;
                            const label = labelParts.join(':') || '';
                            const decodedLabel = decodeURIComponent(label);
                            
                            return (
                              <Button
                                size="sm"
                                className={cn(
                                  "m-1 font-black text-[9.5px] sm:text-[10.5px] rounded-xl h-8 sm:h-10 px-3 sm:px-5 gap-1.5 sm:gap-2 shadow-premium hover:scale-105 transition-all active:scale-95 border border-white/20",
                                  type === 'call' && "bg-green-500 hover:bg-green-600 text-white",
                                  type === 'chat' && "bg-blue-500 hover:bg-blue-600 text-white",
                                  type === 'friend' && "bg-white text-blue-600 hover:bg-blue-50"
                                )}
                                onClick={() => handleAIAction(type, uid, decodedLabel)}
                              >
                                {type === 'call' && <Video className="h-3.5 w-3.5" />}
                                {type === 'chat' && <MessageSquare className="h-3.5 w-3.5" />}
                                {type === 'friend' && <Sparkles className="h-3.5 w-3.5" />}
                                {children}
                              </Button>
                            );
                          }
                        }
                        return <a href={href} {...props} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline underline-offset-4">{children}</a>;
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </motion.div>
          ))}
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-3"
            >
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl sm:rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 shadow-premium">
                <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="bg-white/60 backdrop-blur-md border border-white p-3.5 rounded-[22px] rounded-tl-none shadow-premium flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
              </div>
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
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="p-4 sm:p-6 pt-0 sticky bottom-0 z-40 bg-transparent">
        <div className="glass-card bg-white/90 p-1.5 sm:p-2 rounded-[28px] sm:rounded-[32px] border border-white shadow-huge group focus-within:ring-2 focus-within:ring-blue-100 transition-all max-w-2xl mx-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" className="shrink-0 rounded-2xl h-10 w-10 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-90" onClick={clearChat} title="مسح المحادثة">
              <Trash2 className="h-5 w-5" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اسألني أي شيء..."
              className="border-none focus-visible:ring-0 h-10 sm:h-12 bg-transparent text-right font-bold placeholder:text-gray-400 text-sm sm:text-base"
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <Button
              size="icon"
              className={cn(
                "h-10 w-10 sm:h-12 sm:w-12 rounded-full transition-all duration-300 shadow-lg active:scale-90 shrink-0",
                input.trim() ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              <Send className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
        </div>
      </div>
    </div>
  );
};
