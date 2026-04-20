import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Lock, Check, X, ChevronRight, Timer, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';

interface PINOverlayProps {
  mode: 'setup' | 'unlock' | 'change';
  onSuccess: () => void;
  onCancel?: () => void;
}

export const PINOverlay: React.FC<PINOverlayProps> = ({ mode, onSuccess, onCancel }) => {
  const { user } = useAuth();
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm' | 'delay' | 'verify_old'>(
    mode === 'unlock' ? 'enter' : 'enter'
  );
  const [error, setError] = useState(false);
  const [lockDelay, setLockDelay] = useState(0); // in minutes

  useEffect(() => {
    if (user) {
      const fetchPin = async () => {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const pinData = snap.data().security?.pin || null;
          setStoredPin(pinData);
          if (mode === 'change' && pinData) {
            setStep('verify_old');
          }
        }
      };
      fetchPin();
    }
  }, [user, mode]);

  const handleNumberClick = (num: string) => {
    if (error) setError(false);
    if (step === 'confirm') {
      if (confirmPin.length < 4) setConfirmPin(prev => prev + num);
    } else {
      if (pin.length < 4) setPin(prev => prev + num);
    }
  };

  const handleDelete = () => {
    if (step === 'confirm') {
      setConfirmPin(prev => prev.slice(0, -1));
    } else {
      setPin(prev => prev.slice(0, -1));
    }
  };

  useEffect(() => {
    if (mode === 'unlock' && pin.length === 4) {
      if (pin === storedPin) {
        onSuccess();
      } else {
        setError(true);
        setTimeout(() => setPin(''), 500);
      }
    }

    if (mode === 'change' && step === 'verify_old' && pin.length === 4) {
      if (pin === storedPin) {
        setPin('');
        setStep('enter');
      } else {
        setError(true);
        setTimeout(() => setPin(''), 500);
      }
    }

    if (mode === 'setup' || (mode === 'change' && step !== 'verify_old')) {
      if (step === 'enter' && pin.length === 4) {
        setStep('confirm');
      } else if (step === 'confirm' && confirmPin.length === 4) {
        if (pin === confirmPin) {
          setStep('delay');
        } else {
          setError(true);
          setTimeout(() => setConfirmPin(''), 500);
        }
      }
    }
  }, [pin, confirmPin, mode, step, storedPin, onSuccess]);

  const saveSettings = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'security.pin': pin,
        'security.lockDelay': lockDelay,
        'security.isEnabled': true,
        'security.updatedAt': new Date()
      });
      toast.success('تم تفعيل التأمين بنجاح 🛡️');
      onSuccess();
    } catch (err) {
      toast.error('حدث خطأ أثناء حفظ الإعدادات');
    }
  };

  const delays = [
    { label: 'فوراً عند الخروج', value: 0 },
    { label: 'بعد دقيقة واحدة', value: 1 },
    { label: 'بعد 5 دقائق', value: 5 },
    { label: 'بعد 15 دقيقة', value: 15 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-blue-600 flex flex-col items-center justify-center p-6 text-white text-right"
      dir="rtl"
    >
      {/* Background Decorative Circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500 rounded-full blur-[120px] opacity-50" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-700 rounded-full blur-[120px] opacity-30" />
      </div>

      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-8"
        >
          <div className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-[28px] flex items-center justify-center border border-white/20 shadow-2xl">
            <Shield className="w-10 h-10 text-white" />
          </div>
        </motion.div>

        <h2 className="text-2xl font-black mb-2 tracking-tight">
          {mode === 'unlock' ? 'أدخل رمز PIN' : 
           step === 'verify_old' ? 'الرمز الحالي' :
           step === 'delay' ? 'متى يتم القفل؟' : 
           step === 'confirm' ? 'تأكيد الرمز' : 'إعداد رمز PIN الجديد'}
        </h2>
        <p className="text-blue-100/70 font-bold mb-10 text-center px-4">
          {mode === 'unlock' ? 'يرجى إدخال الرمز المكون من 4 أرقام لفتح التطبيق' :
           step === 'verify_old' ? 'يرجى إدخال رمز PIN الحالي للمتابعة' :
           step === 'delay' ? 'اختر وقت تفعيل قفل الشاشة التلقائي' :
           step === 'confirm' ? 'أعد إدخال الرمز للتأكد من صحته' : 'أنشئ رمزاً قوياً لحماية خصوصيتك ومحادثاتك'}
        </p>

        {step !== 'delay' ? (
          <>
            <div className={cn(
              "flex gap-4 mb-12",
              error && "animate-shake"
            )}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-4 h-4 rounded-full border-2 transition-all duration-300",
                    (step === 'confirm' ? confirmPin.length > i : pin.length > i)
                      ? "bg-white border-white scale-125 shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                      : "border-white/30"
                  )}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-6 w-full px-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  onClick={() => handleNumberClick(n.toString())}
                  className="h-16 w-16 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-2xl font-black hover:bg-white/20 active:scale-90 transition-all shadow-lg"
                >
                  {n}
                </button>
              ))}
              <div />
              <button
                onClick={() => handleNumberClick('0')}
                className="h-16 w-16 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-2xl font-black hover:bg-white/20 active:scale-90 transition-all shadow-lg"
              >
                0
              </button>
              <button
                onClick={handleDelete}
                className="h-16 w-16 rounded-full flex items-center justify-center text-blue-100 hover:text-white transition-colors"
                title="حذف"
              >
                <RefreshCw className="w-6 h-6" />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full flex flex-col gap-3">
            {delays.map((d) => (
              <button
                key={d.value}
                onClick={() => setLockDelay(d.value)}
                className={cn(
                  "w-full p-5 rounded-3xl border flex items-center gap-4 transition-all duration-300",
                  lockDelay === d.value 
                    ? "bg-white text-blue-600 border-white shadow-xl scale-[1.02]" 
                    : "bg-white/5 border-white/10 hover:bg-white/10"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center border-2",
                  lockDelay === d.value ? "border-blue-500 bg-blue-500 text-white" : "border-white/30"
                )}>
                  {lockDelay === d.value && <Check className="w-4 h-4" />}
                </div>
                <div className="flex-1 text-right">
                  <div className="font-black text-lg">{d.label}</div>
                  <div className="text-xs opacity-60">سيتم طلب الرمز {d.label}</div>
                </div>
                <Timer className="w-6 h-6 opacity-30" />
              </button>
            ))}

            <Button
              className="mt-8 h-14 rounded-2xl bg-white text-blue-600 font-black text-lg hover:bg-blue-50 hover:scale-105 active:scale-95 transition-all w-full shadow-2xl"
              onClick={saveSettings}
            >
              إتمام الإعداد وحفظ التغييرات
            </Button>
          </div>
        )}

        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-12 text-blue-100/50 hover:text-white transition-colors flex items-center gap-2 font-bold"
          >
            <X className="w-4 h-4" />
            إلغاء الآن
          </button>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 2;
        }
      `}</style>
    </motion.div>
  );
};
