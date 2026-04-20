import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Phone, Sparkles as SparklesIcon } from 'lucide-react';

export const WelcomeScreen: React.FC = () => {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFDFF] font-sans overflow-hidden relative">
      {/* Background Layer: High-End Light Aesthetics */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-50/50 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-50/50 rounded-full blur-[120px]" />
        
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-8">
        {/* Main Logo Stage */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
          className="relative mb-12"
        >
          {/* Decorative Rings */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-20px] border border-blue-100/60 rounded-[3rem] opacity-50"
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-35px] border border-indigo-100/40 rounded-[4rem] opacity-30"
          />
          
          {/* Central Logo Box */}
          <div className="w-28 h-28 bg-white rounded-[2.5rem] flex items-center justify-center shadow-[0_20px_50px_rgba(59,130,246,0.12)] border border-white/50 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-blue-500 opacity-90" />
            
            {/* Glossy Overlay */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-white/10 skew-y-[-10deg] -translate-y-4" />
            
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="flex items-center justify-center"
            >
              <div className="relative">
                <MessageSquare className="h-14 w-14 text-white relative z-10 drop-shadow-xl" />
                <motion.div 
                   animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
                   transition={{ duration: 4, repeat: Infinity }}
                   className="absolute -bottom-1 -right-1 bg-white p-1 rounded-lg shadow-lg"
                >
                   <Phone className="h-4 w-4 text-blue-600 fill-current" />
                </motion.div>
              </div>
            </motion.div>
          </div>
          
          {/* Status Indicator Bubble */}
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8, type: "spring" }}
            className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-2xl shadow-lg border border-blue-50 flex items-center justify-center"
          >
            <SparklesIcon className="h-4 w-4 text-blue-500 animate-pulse" />
          </motion.div>
        </motion.div>

        {/* Branding & Typography */}
        <div className="text-center space-y-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            <h1 className="text-4xl font-black text-gray-900 tracking-tight flex items-center justify-center gap-2">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">تواصل</span>
            </h1>
            <p className="text-[11px] font-black text-gray-400 tracking-[0.3em] uppercase opacity-60 mt-2">Premium Messenger v2.0</p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="pt-2 px-4"
          >
            <p className="text-[13px] text-gray-500 font-bold leading-relaxed">
              تجربة تواصل ذكية، آمنة، ومصممة <br/> خصيصاً لتناسب عالمك الرقمي
            </p>
          </motion.div>
        </div>

        {/* Loading Interaction */}
        <div className="mt-16 w-full space-y-6 flex flex-col items-center">
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden relative border border-gray-50 shadow-inner">
            <motion.div
              initial={{ left: '-100%' }}
              animate={{ left: '100%' }}
              transition={{ 
                repeat: Infinity, 
                duration: 2, 
                ease: "easeInOut" 
              }}
              className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full shadow-[0_0_15px_rgba(59,130,246,0.3)]"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                  className="w-1.5 h-1.5 bg-blue-500 rounded-full"
                />
              ))}
            </div>
            <motion.span
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-[10px] font-black text-blue-600 uppercase tracking-widest"
            >
              جاري المصادقة الآمنة
            </motion.span>
          </div>
        </div>
      </div>

      {/* Decorative Signature Footer */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-12 flex flex-col items-center gap-4"
      >
        <div className="flex items-center gap-3 px-6 py-2 bg-white/40 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm transition-all hover:bg-white/60">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em]">Encrypted Network Ready</span>
        </div>
        
        <div className="flex items-center gap-1.5 text-[8px] font-bold text-gray-300 uppercase tracking-widest">
          <span>Powered by AI Technology</span>
          <div className="w-1 h-1 bg-gray-300 rounded-full" />
          <span>Made for Excellence</span>
        </div>
      </motion.div>
    </div>
  );
};
