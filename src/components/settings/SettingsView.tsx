import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { auth, db } from '../../lib/firebase';
import { LogOut, User, Bell, Shield, CircleHelp, Globe, Edit2, Check, X, Camera, Mic, Video, Info, Settings as SettingsIcon, AlertCircle, Palette, ArrowRight, ShieldAlert, Trash2, MessageSquare } from 'lucide-react';
import { doc, updateDoc, collection, onSnapshot, query, deleteDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Block } from '../../types';
import { useSecurity } from '../../context/SecurityContext';
import { CountdownTimer } from '../common/CountdownTimer';

interface PermissionStatus {
  camera: PermissionState | 'not_supported';
  microphone: PermissionState | 'not_supported';
}

export const SettingsView: React.FC = () => {
  const { profile, user } = useAuth();
  const { triggerSetup } = useSecurity();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(profile?.displayName || '');
  const [newBio, setNewBio] = useState(profile?.bio || '');
  const [updating, setUpdating] = useState(false);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [activeSubSection, setActiveSubSection] = useState<'main' | 'blocked' | 'notifications' | 'appearance'>('main');
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  
  const messageSounds = [
    { id: 'standard', label: 'افتراضي', url: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3' },
    { id: 'pop', label: 'بوب', url: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3' },
    { id: 'ding', label: 'دينغ', url: 'https://assets.mixkit.co/active_storage/sfx/2359/2359-preview.mp3' },
    { id: 'crystal', label: 'كريستال', url: 'https://assets.mixkit.co/active_storage/sfx/2360/2360-preview.mp3' },
  ];

  const callSounds = [
    { id: 'clean', label: 'نقي', url: 'https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3' },
    { id: 'soft', label: 'ناعم', url: 'https://assets.mixkit.co/active_storage/sfx/1358/1358-preview.mp3' },
    { id: 'modern', label: 'مودرن', url: 'https://assets.mixkit.co/active_storage/sfx/1361/1361-preview.mp3' },
    { id: 'digital', label: 'رقمي', url: 'https://assets.mixkit.co/active_storage/sfx/1355/1355-preview.mp3' },
  ];

  const videoSounds = [
    { id: 'cinema', label: 'سينمائي', url: 'https://assets.mixkit.co/active_storage/sfx/2360/2360-preview.mp3' },
    { id: 'tech', label: 'تقني', url: 'https://assets.mixkit.co/active_storage/sfx/2355/2355-preview.mp3' },
    { id: 'vibrant', label: 'حيوي', url: 'https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3' },
    { id: 'ambient', label: 'محيطي', url: 'https://assets.mixkit.co/active_storage/sfx/2359/2359-preview.mp3' },
  ];

  const themes = [
    { id: 'blue', label: 'أزرق كلاسيكي', color: 'bg-blue-600' },
    { id: 'purple', label: 'بنفسجي ملكي', color: 'bg-indigo-600' },
    { id: 'emerald', label: 'أخضر زمردي', color: 'bg-emerald-600' },
    { id: 'rose', label: 'وردي ناعم', color: 'bg-rose-500' },
  ];

  const playPreview = (url: string) => {
    const audio = new Audio(url);
    audio.volume = 0.5;
    audio.play();
  };

  const handleUpdateTheme = async (themeId: string) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        theme: themeId
      });
      toast.success('تم تغيير السمة بنجاح');
    } catch (e) {
      toast.error('فشل تغيير السمة');
    }
  };

  const handleUpdateAppearance = async (key: string, value: string) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        [`appearance.${key}`]: value
      });
      toast.success('تم تحديث المظهر بنجاح');
    } catch (e) {
      toast.error('فشل تحديث المظهر');
    }
  };

  const handleUpdateNotifications = async (key: string, value: string) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        [`notifications.${key}`]: value
      });
      toast.success('تم تحديث إعدادات التنبيهات');
    } catch (e) {
      toast.error('فشل تحديث الإعدادات');
    }
  };
  
  const [permissions, setPermissions] = useState<PermissionStatus>({
    camera: 'prompt',
    microphone: 'prompt'
  });

  const checkPermissions = async () => {
    try {
      // Camera
      const cam = await navigator.permissions.query({ name: 'camera' as any });
      // Microphone
      const mic = await navigator.permissions.query({ name: 'microphone' as any });

      setPermissions({
        camera: cam.state,
        microphone: mic.state
      });

      // Listen for changes
      cam.onchange = () => setPermissions(p => ({ ...p, camera: cam.state }));
      mic.onchange = () => setPermissions(p => ({ ...p, microphone: mic.state }));
    } catch (e) {
      console.log('Permissions API not fully supported');
    }
  };

  React.useEffect(() => {
    checkPermissions();
  }, []);

  const requestPermission = async (type: 'camera' | 'microphone') => {
    try {
      if (type === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
      toast.success('تم الوصول بنجاح', {
        description: `أصبح بإمكانك الآن استخدام ${type === 'camera' ? 'الكاميرا' : 'الميكروفون'} في مكالماتك.`
      });
      checkPermissions();
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        toast.error('تم حظر الوصول', {
          description: 'يرجى تغيير الإعدادات من شريط عنوان المتصفح لتتمكن من استخدام هذه الميزة.'
        });
        setShowPermissionGuide(true);
      } else {
        toast.error('حدث خطأ غير متوقع', {
          description: 'تأكد من أن جهازك متصل وأن الكاميرا/الميكروفون لا يستخدمهما تطبيق آخر.'
        });
      }
      checkPermissions();
    }
  };

  // Sync state with profile when it loads or changes (if not editing)
  React.useEffect(() => {
    if (!isEditing && profile) {
      setNewName(profile.displayName || '');
      setNewBio(profile.bio || '');
    }
  }, [profile, isEditing]);

  React.useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'users', user.uid, 'blocks'), (snap) => {
      setBlockedUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, [user]);

  const unblockFromSettings = async (userId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'blocks', userId));
      toast.success('تم فك الحظر');
    } catch (e) {
      toast.error('فشل فك الحظر');
    }
  };

  const handleUpdateProfile = async () => {
    if (!profile) return;
    
    const trimmedName = newName.trim();
    const trimmedBio = newBio.trim();

    // Check if anything changed
    const nameChanged = trimmedName !== (profile.displayName || '');
    const bioChanged = trimmedBio !== (profile.bio || '');

    if (!nameChanged && !bioChanged) {
      setIsEditing(false);
      return;
    }

    if (!trimmedName) {
      toast.error('الاسم مطلوب');
      return;
    }

    if (trimmedBio.length > 200) {
      toast.error('الحالة يجب أن تكون أقل من 200 حرف');
      return;
    }

    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName: trimmedName,
        bio: trimmedBio
      });
      toast.success('تم تحديث الملف الشخصي بنجاح');
      setIsEditing(false);
    } catch (error: any) {
      console.error("Profile Update Error:", error);
      if (error?.message?.includes('permission-denied')) {
        toast.error('عذراً، لا تملك الصلاحية لتعديل البيانات أو تجاوزت الحد المسموح');
      } else {
        toast.error('فشل تحديث الملف الشخصي. يرجى المحاولة لاحقاً');
      }
    } finally {
      setUpdating(false);
    }
  };

  const menuItems = [
    { icon: User, label: 'الحساب', color: 'bg-blue-100 text-blue-600', action: () => setActiveSubSection('main') },
    { icon: Bell, label: 'الإشعارات', color: 'bg-purple-100 text-purple-600', action: () => setActiveSubSection('notifications') },
    { icon: Palette, label: 'المظهر والسمات', color: 'bg-pink-100 text-pink-600', action: () => setActiveSubSection('appearance') },
    { icon: ShieldAlert, label: 'قائمة الحظر', color: 'bg-red-100 text-red-600', action: () => setActiveSubSection('blocked') },
    { icon: Shield, label: 'الخصوصية والأمان', color: 'bg-green-100 text-green-600', action: () => triggerSetup('change') },
    { icon: Globe, label: 'اللغة', color: 'bg-orange-100 text-orange-600' },
    { icon: CircleHelp, label: 'المساعدة والدعم', color: 'bg-gray-100 text-gray-600' },
  ];
  
  const testBackgroundNotification = async (type: 'chat' | 'call') => {
    if (!('serviceWorker' in navigator)) {
      toast.error('المتصفح لا يدعم هذه الميزة');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      let permission = Notification.permission;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        toast.error('صلاحية الإشعارات غير مفعلة', {
          description: 'يرجى تفعيل الإشعارات من إعدادات المتصفح لتتمكن من تجربة هذه الميزة.'
        });
        return;
      }

      const title = type === 'call' ? '📞 مكالمة واردة الآن' : '💬 رسالة جديدة من عبدالله';
      const body = type === 'call' ? 'اتصال فيديو جاري... اضغط للرد' : 'أهلاً بك! هذا إشعار تجريبي لاختبار نظام التنبيهات في الخلفية.';
      
      const options: any = {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        image: type === 'call' ? 'https://picsum.photos/seed/calltest/800/400' : 'https://picsum.photos/seed/msgtest/800/400',
        tag: type === 'call' ? 'test-call' : 'test-msg',
        renotify: true,
        requireInteraction: type === 'call',
        vibrate: type === 'call' ? [500, 110, 500, 110, 450] : [200, 100, 200],
        data: {
          url: type === 'call' ? '/calls' : '/',
          chatId: 'demo-chat',
          type
        },
        actions: type === 'call' 
          ? [
              { action: 'accept', title: 'رد', icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png' },
              { action: 'decline', title: 'رفض', icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048954.png' }
            ]
          : [
              { action: 'reply', title: 'رد سريع', icon: 'https://cdn-icons-png.flaticon.com/512/1932/1932931.png' },
              { action: 'mark_read', title: 'تمييز كمقروءة' }
            ]
      };

      await registration.showNotification(title, options);
      toast.success('تم إرسال إشعار تجريبي', {
        description: 'تحقق من مركز الإشعارات في جهازك الآن.'
      });
    } catch (error) {
      console.error('Error showing test notification:', error);
      toast.error('فشل إرسال الإشعار التجريبي');
    }
  };

  if (activeSubSection === 'notifications') {
    return (
      <ScrollArea className="h-full bg-transparent">
        <div className="p-3 sm:p-6 pb-24 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => setActiveSubSection('main')} className="rounded-xl h-9 w-9">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">إعدادات الإشعارات</h2>
          </div>

          <div className="flex flex-col gap-6">
            {/* Test Notifications Section */}
            <section className="bg-accent-primary/5 p-4 rounded-[28px] border border-accent-primary/10">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-accent-primary text-white rounded-xl shadow-lg shadow-accent-primary/20">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-sm">تجربة الإشعارات</h3>
                  <p className="text-[10px] text-gray-400 font-bold opacity-80">اختبر ظهور الإشعارات في الخلفية</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={() => testBackgroundNotification('chat')}
                  className="rounded-2xl bg-white hover:bg-gray-50 text-gray-900 border-none shadow-sm flex flex-col items-center gap-1.5 h-auto py-4 group"
                >
                  <MessageSquare className="h-5 w-5 text-accent-primary transition-transform group-hover:scale-110" />
                  <span className="text-[10px] font-black">إشعار دردشة</span>
                </Button>
                <Button 
                  onClick={() => testBackgroundNotification('call')}
                  className="rounded-2xl bg-white hover:bg-gray-50 text-gray-900 border-none shadow-sm flex flex-col items-center gap-1.5 h-auto py-4 group"
                >
                  <Video className="h-5 w-5 text-red-500 transition-transform group-hover:scale-110" />
                  <span className="text-[10px] font-black">إشعار مكالمة</span>
                </Button>
              </div>
            </section>

            {/* Message Sounds */}
            <section>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="p-1.5 bg-accent-primary/5 text-accent-primary rounded-lg">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-sm">نغمة الرسائل</h3>
                  <p className="text-[9px] text-gray-400 font-bold opacity-70">الصوت عند استلام رسالة</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {messageSounds.map((sound) => (
                  <button
                    key={sound.id}
                    onClick={() => {
                      playPreview(sound.url);
                      handleUpdateNotifications('messageSound', sound.url);
                    }}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-xl border transition-all active:scale-95 group",
                      profile?.notifications?.messageSound === sound.url 
                        ? "bg-accent-primary/5 border-accent-primary text-accent-primary shadow-sm" 
                        : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
                    )}
                  >
                    <span className="text-[11px] font-black">{sound.label}</span>
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      profile?.notifications?.messageSound === sound.url ? "bg-accent-primary scale-125" : "bg-gray-200"
                    )} />
                  </button>
                ))}
              </div>
            </section>

            {/* Call Sounds */}
            <section>
              <div className="flex items-center gap-3 mb-4 px-2">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <Mic className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-base">نغمة المكالمات الصوتية</h3>
                  <p className="text-[10px] text-gray-400 font-bold">اختر الرنة التي تفضلها عند استلام مكالمة صوتية</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {callSounds.map((sound) => (
                  <button
                    key={sound.id}
                    onClick={() => {
                      playPreview(sound.url);
                      handleUpdateNotifications('callSound', sound.url);
                    }}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border-2 transition-all active:scale-95 group",
                      profile?.notifications?.callSound === sound.url 
                        ? "bg-blue-50 border-blue-200 text-blue-600 shadow-sm" 
                        : "bg-white border-transparent text-gray-400 hover:border-gray-100"
                    )}
                  >
                    <span className="text-xs font-black">{sound.label}</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      profile?.notifications?.callSound === sound.url ? "bg-blue-500 scale-125" : "bg-gray-200"
                    )} />
                  </button>
                ))}
              </div>
            </section>

            {/* Video Sounds */}
            <section>
              <div className="flex items-center gap-3 mb-4 px-2">
                <div className="p-2 bg-orange-100 text-orange-600 rounded-xl">
                  <Video className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-base">نغمة مكالمات الفيديو</h3>
                  <p className="text-[10px] text-gray-400 font-bold">اختر الرنة الخاصة بمكالمات الفيديو الواردة</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {videoSounds.map((sound) => (
                  <button
                    key={sound.id}
                    onClick={() => {
                      playPreview(sound.url);
                      handleUpdateNotifications('videoCallSound', sound.url);
                    }}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border-2 transition-all active:scale-95 group",
                      profile?.notifications?.videoCallSound === sound.url 
                        ? "bg-orange-50 border-orange-200 text-orange-600 shadow-sm" 
                        : "bg-white border-transparent text-gray-400 hover:border-gray-100"
                    )}
                  >
                    <span className="text-xs font-black">{sound.label}</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      profile?.notifications?.videoCallSound === sound.url ? "bg-orange-500 scale-125" : "bg-gray-200"
                    )} />
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </ScrollArea>
    );
  }

  if (activeSubSection === 'appearance') {
    const backgrounds = [
      { id: 'none', label: 'بدون خلفية', class: 'bg-slate-50' },
      { id: 'grad-1', label: 'شروق الشمس', class: 'bg-gradient-to-br from-blue-50 to-indigo-50' },
      { id: 'grad-2', label: 'غابة هادئة', class: 'bg-gradient-to-br from-emerald-50 to-teal-50' },
      { id: 'grad-3', label: 'أرجواني', class: 'bg-gradient-to-br from-purple-50 to-pink-50' },
      { id: 'grad-4', label: 'فجر النهار', class: 'bg-gradient-to-br from-orange-50 to-rose-50' },
      { id: 'mesh-1', label: 'موجات زرقاء', class: 'bg-blue-50/50 backdrop-blur-3xl' },
    ];

    const bubbleStyles = [
      { id: 'modern', label: 'عصري (منحني)', icon: '✨' },
      { id: 'glass', label: 'زجاجي (شفاف)', icon: '🫧' },
      { id: 'classic', label: 'كلاسيكي (حاد)', icon: '📐' },
    ];

    return (
      <ScrollArea className="h-full bg-transparent">
        <div className="p-4 sm:p-6 pb-24 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <Button variant="ghost" size="icon" onClick={() => setActiveSubSection('main')} className="rounded-xl h-9 w-9">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">المظهر والسمات</h2>
          </div>

          <div className="flex flex-col gap-10">
            {/* Primary Theme */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Palette className="h-4 w-4 text-accent-primary" />
                <h3 className="font-black text-gray-900 text-sm">لون التطبيق الأساسي</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleUpdateTheme(t.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-95 group",
                      profile?.theme === t.id 
                        ? "bg-accent-primary/5 border-accent-primary shadow-sm" 
                        : "bg-white border-gray-100 hover:border-gray-200"
                    )}
                  >
                    <div className={cn("w-6 h-6 rounded-lg shadow-sm border-2 border-white", t.color)} />
                    <span className={cn("text-xs font-black", profile?.theme === t.id ? "text-accent-primary" : "text-gray-500")}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Chat Background */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-4 w-4 text-blue-500" />
                <h3 className="font-black text-gray-900 text-sm">خلفية المحادثة</h3>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {backgrounds.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => handleUpdateAppearance('chatBackground', bg.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-[24px] border transition-all active:scale-95 group relative overflow-hidden",
                      profile?.appearance?.chatBackground === bg.id 
                        ? "border-accent-primary shadow-md ring-2 ring-accent-primary/10" 
                        : "border-gray-100 bg-white"
                    )}
                  >
                    <div className={cn("w-full h-12 rounded-xl mb-1", bg.class)} />
                    <span className="text-[9px] font-black text-gray-600">{bg.label}</span>
                    {profile?.appearance?.chatBackground === bg.id && (
                      <div className="absolute top-1 right-1 bg-accent-primary text-white p-0.5 rounded-full shadow-sm">
                        <Check className="h-2 w-2" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* Bubble Style */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Palette className="h-4 w-4 text-purple-500" />
                <h3 className="font-black text-gray-900 text-sm">نمط الفقاعات</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {bubbleStyles.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => handleUpdateAppearance('bubbleStyle', style.id as any)}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-2xl border transition-all active:scale-95 group",
                      profile?.appearance?.bubbleStyle === style.id 
                        ? "bg-purple-50 border-purple-200 text-purple-600" 
                        : "bg-white border-gray-100 text-gray-400"
                    )}
                  >
                    <span className="text-xl">{style.icon}</span>
                    <span className="text-[11px] font-black">{style.label}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </ScrollArea>
    );
  }

  if (activeSubSection === 'blocked') {
    return (
      <ScrollArea className="h-full bg-transparent">
        <div className="p-3 sm:p-6 pb-24 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => setActiveSubSection('main')} className="rounded-xl h-9 w-9">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">قائمة الحظر</h2>
          </div>

          <p className="text-gray-400 font-bold text-xs mb-4 px-1 leading-relaxed text-right opacity-80">
            هؤلاء الأشخاص لن يتمكنوا من مراسلتك أو رؤية حالتك.
          </p>

          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {blockedUsers.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="bg-white/40 backdrop-blur-md rounded-[32px] p-10 border border-white flex flex-col items-center justify-center text-center gap-4"
                >
                  <div className="w-16 h-16 bg-accent-primary/5 rounded-full flex items-center justify-center text-2xl animate-float">🕊️</div>
                  <p className="text-gray-400 font-bold text-sm">قائمة الحظر فارغة حالياً</p>
                </motion.div>
              ) : (
                blockedUsers.map((blocked) => (
                  <motion.div
                    key={blocked.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20, scale: 0.9 }}
                    className="bg-white/60 backdrop-blur-xl rounded-[24px] p-4 border border-white shadow-premium flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 border-2 border-white shadow-sm ring-2 ring-transparent group-hover:ring-red-50 Transition-all">
                        <AvatarImage src={blocked.photoURL} className="object-cover" />
                        <AvatarFallback className="bg-red-100 text-red-600 font-bold">{blocked.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-black text-gray-900 text-sm">{blocked.displayName}</h4>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-gray-400 font-bold">
                            {blocked.expiresAt ? 'حظر مؤقت' : 'حظر دائم'}
                          </p>
                          {blocked.expiresAt && (
                            <CountdownTimer 
                              expiresAt={blocked.expiresAt} 
                              className="text-[9px] text-amber-500 font-black bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100"
                              onExpire={() => unblockFromSettings(blocked.id)}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => unblockFromSettings(blocked.id)}
                      className="rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white font-black text-[10px] h-8 transition-all active:scale-95"
                    >
                      فك الحظر
                    </Button>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full bg-transparent">
      <div className="p-4 sm:p-8 pb-32 max-w-2xl mx-auto">
        <div className="flex flex-col items-center gap-4 sm:gap-5 mb-6 sm:mb-8">
          <div className="relative group">
            <div className="absolute inset-0 bg-accent-primary/10 rounded-full blur-2xl group-hover:bg-accent-primary/20 transition-all duration-700" />
            <Avatar className="h-24 w-24 sm:h-32 sm:w-32 p-1 bg-white border border-gray-100 shadow-premium relative z-10 transition-transform duration-500 group-hover:scale-105">
              <AvatarImage src={profile?.photoURL} className="rounded-full object-cover" />
              <AvatarFallback className="text-3xl sm:text-4xl font-black bg-gradient-to-br from-accent-primary to-accent-secondary text-white">
                {profile?.displayName?.[0]}
              </AvatarFallback>
            </Avatar>
            <Button 
              size="icon" 
              className="absolute bottom-0 right-0 h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-accent-primary border-2 sm:border-4 border-white shadow-lg hover:opacity-90 transition-all active:scale-90 z-20 text-white"
            >
               <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
          
          <div className="text-center w-full max-w-sm px-4">
            {isEditing ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2.5 bg-white/60 backdrop-blur-xl p-4 rounded-[28px] border border-white shadow-premium"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] font-black text-accent-primary uppercase text-right mr-2 tracking-widest opacity-70">الاسم</span>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="text-right font-black h-9 rounded-xl bg-white border-gray-100 shadow-sm focus:ring-accent-primary/20 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] font-black text-accent-primary uppercase text-right mr-2 tracking-widest opacity-70">الحالة</span>
                  <Input
                    value={newBio}
                    onChange={(e) => setNewBio(e.target.value)}
                    className="text-right font-bold h-9 rounded-xl bg-white border-gray-100 shadow-sm text-xs focus:ring-accent-primary/20"
                  />
                </div>
                <div className="flex gap-2 mt-1">
                  <Button className="flex-1 rounded-xl bg-accent-primary hover:opacity-90 font-black h-9 shadow-md text-xs text-white" onClick={handleUpdateProfile} disabled={updating}>
                    حفظ
                  </Button>
                  <Button variant="ghost" className="flex-1 rounded-xl h-9 font-bold text-xs" onClick={() => setIsEditing(false)}>
                    إلغاء
                  </Button>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">{profile?.displayName}</h2>
                  <button onClick={() => { setNewName(profile?.displayName || ''); setNewBio(profile?.bio || ''); setIsEditing(true); }} className="text-accent-primary hover:opacity-80 p-1.5 bg-accent-primary/5 rounded-lg transition-all hover:scale-110 active:scale-90">
                    <Edit2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </button>
                </div>
                <p className="text-gray-500 font-medium text-xs sm:text-sm mt-1 line-clamp-1 opacity-80">
                  {profile?.bio || 'لا توجد حالة...'}
                </p>
                <p className="text-gray-400 font-black text-[9px] mt-2 uppercase tracking-[0.15em] opacity-50">{profile?.email}</p>
              </div>
            )}
          </div>
        </div>

        {/* Permissions UI */}
        <section className="mt-8 sm:mt-12 mb-8 sm:mb-10">
          <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="p-1.5 sm:p-2 bg-accent-primary/5 rounded-lg sm:rounded-xl">
              <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-accent-primary" />
            </div>
            <h3 className="font-black text-gray-900 text-lg sm:text-xl tracking-tight">الأمان والخصوصية</h3>
          </div>
          
          <div className="bg-white/60 backdrop-blur-xl rounded-[24px] sm:rounded-[32px] p-4 sm:p-6 shadow-premium border border-white flex flex-col gap-4 sm:gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={cn(
                  "p-2 sm:p-3 rounded-xl sm:rounded-2xl transition-all shadow-sm",
                  permissions.camera === 'granted' ? "bg-green-50 text-green-600 ring-4 ring-green-500/5" : "bg-gray-50 text-gray-400"
                )}>
                  <Camera className={cn("h-5 w-5 sm:h-6 sm:w-6", permissions.camera === 'granted' && "animate-pulse-soft")} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 text-sm sm:text-base">الكاميرا</h4>
                  <p className="text-[9px] sm:text-[11px] text-gray-400 font-bold tracking-wide">أذونات مكالمات الفيديو</p>
                </div>
              </div>
              <div className="shrink-0">
                {permissions.camera === 'granted' ? (
                  <Badge className="bg-green-100 text-green-700 border-none px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest">نشط الآن</Badge>
                ) : (
                  <Button size="sm" onClick={() => requestPermission('camera')} className="rounded-full bg-accent-primary text-white px-4 sm:px-6 h-8 sm:h-9 font-black text-[10px] sm:text-xs">تفعيل</Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={cn(
                  "p-2 sm:p-3 rounded-xl sm:rounded-2xl transition-all shadow-sm",
                  permissions.microphone === 'granted' ? "bg-green-50 text-green-600 ring-4 ring-green-500/5" : "bg-gray-50 text-gray-400"
                )}>
                  <Mic className={cn("h-5 w-5 sm:h-6 sm:w-6", permissions.microphone === 'granted' && "animate-pulse-soft")} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 text-sm sm:text-base">الميكروفون</h4>
                  <p className="text-[9px] sm:text-[11px] text-gray-400 font-bold tracking-wide">أذونات التقاط الصوت</p>
                </div>
              </div>
              <div className="shrink-0">
                {permissions.microphone === 'granted' ? (
                  <Badge className="bg-green-100 text-green-700 border-none px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest">نشط الآن</Badge>
                ) : (
                  <Button size="sm" onClick={() => requestPermission('microphone')} className="rounded-full bg-accent-primary text-white px-4 sm:px-6 h-8 sm:h-9 font-black text-[10px] sm:text-xs">تفعيل</Button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Categories Menu */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {menuItems.map((item, idx) => (
            <button
              key={idx}
              onClick={item.action}
              className="flex items-center justify-between p-3 sm:p-4 bg-white/60 backdrop-blur-xl rounded-[20px] transition-all border border-white shadow-premium hover:shadow-huge hover:bg-white group"
            >
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-xl transition-transform group-hover:scale-110", item.color)}>
                  <item.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <span className="font-black text-gray-800 text-[12px] sm:text-sm group-hover:text-accent-primary transition-colors tracking-tight">{item.label}</span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-accent-primary group-hover:translate-x-[-2px] transition-all rotate-180" />
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          className="w-full mt-6 h-12 rounded-[20px] bg-red-50/50 text-red-600 hover:bg-red-50 hover:text-red-700 font-black text-sm gap-2 transition-all"
          onClick={() => auth.signOut()}
        >
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </Button>
      </div>
    </ScrollArea>
  );
};
