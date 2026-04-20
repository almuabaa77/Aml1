import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { motion } from 'motion/react';
import { LogIn, UserPlus, Key, Mail, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export const LoginForm: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('تم تسجيل الدخول بنجاح');
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName: name });
        toast.success('تم إنشاء الحساب بنجاح');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-500 to-cyan-400 font-sans" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative"
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-300/30 rounded-full blur-3xl animate-water" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-cyan-300/30 rounded-full blur-3xl animate-water" style={{ animationDelay: '2s' }} />
        
        <Card className="w-full max-w-md backdrop-blur-md bg-white/90 border-none shadow-2xl overflow-hidden relative z-10">
          <CardHeader className="text-center space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-blue-800">
              {isLogin ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
            </CardTitle>
            <CardDescription className="text-blue-600/70">
              {isLogin ? 'مرحباً بك مجدداً في تواصل' : 'انضم إلينا اليوم وابدأ التواصل'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-blue-50/80 border border-blue-100 rounded-2xl p-4 mb-4 flex flex-col gap-2 shadow-inner"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <span className="text-sm font-bold text-blue-800">توليد بيانات سريعة:</span>
                </div>
                <Button 
                  type="button" 
                  variant="secondary" 
                  size="sm" 
                  className="h-8 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 transition-all shadow-sm"
                  onClick={() => {
                    const randomId = Math.floor(1000 + Math.random() * 9000);
                    const domains = ['chat.io', 'vibe.app', 'link.net', 'space.me'];
                    const domain = domains[Math.floor(Math.random() * domains.length)];
                    const newEmail = `user_${randomId}@${domain}`;
                    setEmail(newEmail);
                    setPassword('123456');
                    if (!isLogin) {
                      const names = ['حمزة', 'مريم', 'ياسين', 'هناء', 'خالد', 'جنى', 'زياد', 'رؤى'];
                      setName(names[Math.floor(Math.random() * names.length)] + ` (${randomId})`);
                    }
                    toast.info('تم توليد بيانات فريدة بنجاح');
                  }}
                >
                  توليد عشوائي
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="bg-white/50 rounded-lg p-2 border border-blue-50">
                  <p className="text-[10px] text-gray-400 mb-0.5">البريد:</p>
                  <p className="text-[11px] font-mono font-bold text-blue-600 truncate">
                    {email || 'سيتم توليده...'}
                  </p>
                </div>
                <div className="bg-white/50 rounded-lg p-2 border border-blue-50">
                  <p className="text-[10px] text-gray-400 mb-0.5">الرمز:</p>
                  <p className="text-[11px] font-mono font-bold text-blue-600">
                    {password || '123456'}
                  </p>
                </div>
              </div>
            </motion.div>
            <form onSubmit={handleSubmit} className="gap-4 flex flex-col">
              {!isLogin && (
                <div className="relative">
                  <span className="absolute right-3 top-3 text-gray-400">👤</span>
                  <Input
                    placeholder="الاسم الكامل"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pr-10 rounded-xl border-blue-100 focus:ring-blue-500 h-12"
                    required
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="absolute right-3 top-3.5 h-5 w-5 text-gray-400" />
                <Input
                  type="email"
                  placeholder="البريد الإلكتروني"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pr-10 rounded-xl border-blue-100 focus:ring-blue-500 h-12"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="relative">
                <Key className="absolute right-3 top-3.5 h-5 w-5 text-gray-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 pl-10 rounded-xl border-blue-100 focus:ring-blue-500 h-12 text-right"
                  autoComplete="current-password"
                  dir="rtl"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-3.5 h-5 w-5 text-gray-400 hover:text-blue-500 transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg transition-all shadow-lg shadow-blue-200"
                disabled={loading}
              >
                {loading ? 'جاري التحميل...' : (isLogin ? <><LogIn className="ml-2 h-5 w-5" /> دخول</> : <><UserPlus className="ml-2 h-5 w-5" /> تسجيل</>)}
              </Button>
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                >
                  {isLogin ? 'ليس لديك حساب؟ سجل الآن' : 'لديك حساب بالفعل؟ سجل دخولك'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
