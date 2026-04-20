import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '../ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-[40px] shadow-huge p-12 border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
            
            <div className="w-24 h-24 bg-red-100 rounded-[32px] flex items-center justify-center mb-8 mx-auto relative z-10">
              <AlertTriangle className="h-10 w-10 text-red-600" />
            </div>

            <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">أوبس! حدث خطأ تقني</h1>
            <p className="text-slate-500 font-bold mb-8 leading-relaxed">
              نعتذر منك، حدث خطأ غير متوقع في معالجة البيانات. فريقنا يعمل على استقرار النظام دائماً.
            </p>

            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => window.location.reload()}
                className="h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black shadow-xl shadow-slate-200 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <RefreshCw className="h-5 w-5" />
                تحديث الصفحة
              </Button>
              <Button 
                variant="ghost"
                onClick={() => window.location.href = '/'}
                className="h-12 rounded-2xl text-slate-400 font-bold hover:bg-slate-50 flex items-center justify-center gap-3"
              >
                <Home className="h-4 w-4" />
                العودة للرئيسية
              </Button>
            </div>

            {process.env.NODE_ENV !== 'production' && (
              <div className="mt-8 p-4 bg-slate-50 rounded-2xl text-right overflow-hidden">
                <p className="text-[10px] font-mono text-slate-400 break-all">{this.state.error?.message}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
