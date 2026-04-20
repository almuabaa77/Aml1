import React from 'react';
import { motion } from 'motion/react';

export const ChatListSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-gray-50/10" dir="rtl">
      <div className="px-6 pt-6 pb-2">
        <div className="h-8 w-32 bg-gray-200 rounded-lg animate-pulse mb-2" />
        <div className="h-3 w-48 bg-gray-100 rounded-lg animate-pulse mb-6" />
        
        <div className="h-11 w-full bg-white rounded-2xl animate-pulse shadow-sm border border-gray-100 mb-6" />
        
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-7 w-16 bg-white border border-gray-100 rounded-full animate-pulse" />
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-4 p-4 bg-white/60 rounded-[24px] border border-gray-100 shadow-sm animate-pulse">
            <div className="h-14 w-14 bg-gray-200 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between items-center">
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-3 w-12 bg-gray-100 rounded" />
              </div>
              <div className="h-3 w-40 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
