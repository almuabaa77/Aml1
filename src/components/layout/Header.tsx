import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import { LogOut, Search, UserPlus } from 'lucide-react';
import { auth } from '../../lib/firebase';

interface HeaderProps {
  title: string;
  onAddContact?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, onAddContact }) => {
  const { profile } = useAuth();

  return (
    <header className="h-[72px] bg-white/40 backdrop-blur-[30px] border-b border-gray-100/50 flex items-center justify-between px-6 sticky top-0 z-40 shrink-0">
      <div className="flex items-center gap-4">
        <div className="relative group cursor-pointer">
          <Avatar className="h-10 w-10 p-0.5 border-2 border-white shadow-premium transition-all duration-500 group-hover:scale-110 group-active:scale-95 group-hover:ring-4 group-hover:ring-accent-primary/10">
            <AvatarImage src={profile?.photoURL} className="object-cover rounded-full" />
            <AvatarFallback className="bg-gradient-to-br from-accent-primary to-accent-secondary text-white font-black text-xs">
              {profile?.displayName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-green-500 border-2 border-white rounded-full shadow-lg shadow-green-500/20" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">{title}</h1>
          <div className="flex items-center gap-1.5 opacity-60">
            <div className="h-1.5 w-1.5 bg-accent-primary rounded-full animate-pulse-soft" />
            <p className="text-[8px] font-black uppercase tracking-[0.15em] text-accent-primary">Secure Environment</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onAddContact && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onAddContact}
            className="h-10 w-10 rounded-2xl bg-accent-primary text-white hover:opacity-90 shadow-lg shadow-accent-primary/30 active:scale-90 transition-all border border-white/20"
          >
            <UserPlus className="h-4.5 w-4.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl bg-white/50 backdrop-blur-md hover:bg-white hover:shadow-premium transition-all duration-300 border border-white group">
          <Search className="h-4.5 w-4.5 text-gray-400 group-hover:text-accent-primary transition-colors" />
        </Button>
      </div>
    </header>
  );
};
