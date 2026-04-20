import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, Sparkles, Smartphone, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      
      // Delay initial show to ensure page is loaded
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowPrompt(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 100, opacity: 0, scale: 0.9 }}
        className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-[400px] z-[100]"
      >
        <div className="glass-ultra rounded-[40px] p-6 relative overflow-hidden group shadow-huge border-white/60">
          {/* Atmospheric Backgrounds inside the card */}
          <div className="absolute inset-0 pointer-events-none z-0">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-accent-primary/20 rounded-full blur-[60px] group-hover:bg-accent-primary/30 transition-all duration-700" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent-secondary/20 rounded-full blur-[60px]" />
          </div>

          <button 
            onClick={() => setShowPrompt(false)}
            className="absolute top-4 left-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-20"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>

          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-2xl flex items-center justify-center shadow-lg transform -rotate-6 group-hover:rotate-0 transition-transform duration-500">
                <Download className="text-white h-7 w-7 animate-premium-float" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none mb-1.5 flex items-center gap-2">
                  ثبت تطبيق تواصل
                  <Sparkles className="h-4 w-4 text-amber-400" />
                </h3>
                <p className="text-[11px] text-gray-400 font-bold tracking-wide italic">تجربة أسرع، اتصال أعمق، خصوصية مطلقة</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3 p-3 bg-white/40 rounded-2xl border border-white/80">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Smartphone className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-[10px] font-black text-gray-600">سهولة الوصول من الشاشة الرئيسية</p>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/40 rounded-2xl border border-white/80">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-[10px] font-black text-gray-600">أداء مستقر حتى مع ضعف الإنترنت</p>
              </div>
            </div>

            <Button 
              onClick={handleInstallClick}
              className="w-full h-14 rounded-[20px] bg-accent-primary text-white font-black text-sm shadow-lg hover:shadow-accent-primary/25 active:scale-95 transition-all flex items-center justify-center gap-3 group/btn"
            >
              <Download className="h-5 w-5 group-hover/btn:translate-y-1 transition-transform" />
              تثبيت التطبيق الآن
            </Button>
            
            <p className="text-center text-[9px] text-gray-400 font-bold mt-4 opacity-60">
              * يدعم جميع الهواتف الذكية (Android & iOS)
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
