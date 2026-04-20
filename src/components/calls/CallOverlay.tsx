import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { doc, updateDoc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Call, UserProfile } from '../../types';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { 
  PhoneOff, Phone, Mic, MicOff, Video, VideoOff, 
  Volume2, Monitor, Minimize2, Maximize2, RotateCw, 
  AlertTriangle, Settings2, Command, ShieldCheck,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { agoraClient, AGORA_APP_ID } from '../../lib/agora';
import AgoraRTC, { ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface CallOverlayProps {
  call: Call;
  isIncoming: boolean;
  onEnd: () => void;
}

// Recipe 7: Immersive Media Visualizer & Premium Call UI
const AudioPulse: React.FC<{ active: boolean, volume: number }> = ({ active, volume }) => (
  <div className="flex items-center justify-center gap-[3px] h-10 w-16">
    {[...Array(8)].map((_, i) => (
      <motion.div
        key={i}
        animate={active ? { 
          height: [6, Math.max(6, (volume / (i * 0.5 + 1)) * 4), 6],
          opacity: [0.3, 1, 0.3],
          backgroundColor: i % 2 === 0 ? "#3b82f6" : "#60a5fa"
        } : { height: 3, opacity: 0.1, backgroundColor: "#ffffff" }}
        transition={{ 
          repeat: Infinity, 
          duration: 0.3 + i * 0.04,
          ease: "easeInOut"
        }}
        className="w-[3.5px] rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
      />
    ))}
  </div>
);

const ConnectionStatus: React.FC<{ quality: number }> = ({ quality }) => (
  <div className="flex items-center gap-1 px-3 py-1.5 bg-black/40 backdrop-blur-xl rounded-full border border-white/10">
    <div className="flex gap-[2px] items-end pb-0.5">
      {[1, 2, 3, 4].map((i) => (
        <div 
          key={i} 
          className={cn(
            "w-1 rounded-full transition-all duration-500",
            i === 1 ? "h-1.5" : i === 2 ? "h-2.5" : i === 3 ? "h-3.5" : "h-4.5",
            i <= (5 - quality) 
              ? (quality <= 2 ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-amber-400") 
              : "bg-white/10"
          )} 
        />
      ))}
    </div>
    <span className="text-[8px] font-black text-white/40 uppercase tracking-widest pl-1">
      {quality <= 2 ? 'Excellent' : quality <= 4 ? 'Good' : 'Poor'}
    </span>
  </div>
);

export const CallOverlay: React.FC<CallOverlayProps> = ({ call, isIncoming, onEnd }) => {
  const [status, setStatus] = useState<'ringing' | 'connected' | 'ended'>(isIncoming ? 'ringing' : 'ringing');
  const [connectionQuality, setConnectionQuality] = useState<number>(1);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(call.type === 'video');
  const [remoteVideoOn, setRemoteVideoOn] = useState(false);
  const [remoteUser, setRemoteUser] = useState<any>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [permissionError, setPermissionError] = useState<'mic' | 'camera' | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const { user, profile } = useAuth();
  
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const localTracks = useRef<{ videoTrack?: ICameraVideoTrack, audioTrack?: IMicrophoneAudioTrack }>({});
  const isJoining = useRef(false);
  const ringtone = useRef<HTMLAudioElement | null>(null);
  const timerInterval = useRef<any>(null);

  // Logic remains robust (Agora, Ringtone, Firestore Sync)
  useEffect(() => {
    const handleVolumeIndicator = (volumes: { uid: string | number, level: number }[]) => {
      const remoteVol = volumes.find(v => v.uid !== user?.uid);
      if (remoteVol) setVolume(remoteVol.level);
    };

    if (status === 'connected') {
      timerInterval.current = setInterval(() => setCallDuration(p => p + 1), 1000);
      agoraClient.enableAudioVolumeIndicator();
      agoraClient.on('volume-indicator', handleVolumeIndicator);

      // Infrastructure: Call Heartbeat to detect abandoned calls
      const heartbeatInterval = setInterval(() => {
        updateDoc(doc(db, 'calls', call.id), { lastHeartbeat: serverTimestamp() }).catch(() => {});
      }, 10000);

      return () => {
        clearInterval(timerInterval.current);
        clearInterval(heartbeatInterval);
        agoraClient.off('volume-indicator', handleVolumeIndicator);
      };
    } else {
      clearInterval(timerInterval.current);
      setVolume(0);
    }
  }, [status, user?.uid]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. Initial Data Fetch & Unmount Cleanup
  useEffect(() => {
    const otherId = isIncoming ? call.callerId : call.receiverId;
    getDoc(doc(db, 'users', otherId)).then(snap => setOtherUser(snap.data() as UserProfile));

    return () => {
      leaveChannel();
    };
  }, []);

  // 2. Firestore Call Sync & Ringing Timeout
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(doc(db, 'calls', call.id), (snap) => {
      const data = snap.data() as Call;
      if (!data) return;
      
      // Handle status transitions
      if (data.status === 'accepted' && !isIncoming && status === 'ringing') {
        setStatus('connected');
        joinChannel();
      } else if (['rejected', 'ended', 'missed'].includes(data.status)) {
        onEnd();
      }
    });

    // Ringing Timeout (45 seconds)
    let timeout: any;
    if (status === 'ringing') {
      timeout = setTimeout(async () => {
        if (status === 'ringing') {
          // Check if it's still ringing before marking missed
          const freshSnap = await getDoc(doc(db, 'calls', call.id));
          if (freshSnap.data()?.status === 'ringing') {
            await updateDoc(doc(db, 'calls', call.id), { status: 'missed', endedAt: serverTimestamp() });
            toast.info('انتهى وقت الرنين، لم يتم الرد على المكالمة');
          }
        }
      }, 45000);
    }

    return () => { 
      unsub(); 
      if (timeout) clearTimeout(timeout);
    };
  }, [status, user]); // We keep status to clear/set timeout correctly

  // Add beforeunload listener to prevent ghost calls if tab is closed
  useEffect(() => {
    const handleUnload = () => {
      if (status === 'ringing' || status === 'connected') {
        updateDoc(doc(db, 'calls', call.id), { 
          status: 'ended', 
          endedAt: serverTimestamp(),
          endedBy: user?.uid || 'system'
        });
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [status, user]);

  // Update User "isInCall" State
  useEffect(() => {
    if (!user) return;
    const updateBusyState = async (busy: boolean) => {
      // Guard against updating if user is no longer available (e.g. during logout)
      if (!user?.uid) return;
      
      try {
        await updateDoc(doc(db, 'users', user.uid), { isInCall: busy });
      } catch (e) {
        // Only log error if it's not a permission error during unmount/logout
        if (!(e instanceof Error && e.message.includes('permission'))) {
          console.error("Busy State Update Error:", e);
        }
      }
    };

    if (status === 'ringing' || status === 'connected') {
      updateBusyState(true);
    } else {
      updateBusyState(false);
    }

    return () => { 
      // Safe cleanup
      if (user?.uid) {
        updateDoc(doc(db, 'users', user.uid), { isInCall: false }).catch(() => {}); 
      }
    };
  }, [status, user]);

  useEffect(() => {
    if (status !== 'ringing') {
      ringtone.current?.pause();
      ringtone.current = null;
      return;
    }

    let soundUrl = isIncoming 
      ? (call.type === 'video' ? profile?.notifications?.videoCallSound || 'https://assets.mixkit.co/active_storage/sfx/2360/2360-preview.mp3' : profile?.notifications?.callSound || 'https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3')
      : 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';
    
    ringtone.current?.pause();
    ringtone.current = new Audio(soundUrl);
    ringtone.current.loop = true;
    ringtone.current.play().catch(() => {});
    return () => ringtone.current?.pause();
  }, [status, isIncoming, call.type, profile?.notifications]);

  // Reliable Media Playing - Watch for state and refs
  useEffect(() => {
    if (status === 'connected') {
      if (videoOn && localTracks.current.videoTrack && localVideoRef.current) {
        localTracks.current.videoTrack.play(localVideoRef.current);
      }
      if (remoteVideoOn && remoteUser?.videoTrack && remoteVideoRef.current) {
        remoteUser.videoTrack.play(remoteVideoRef.current);
      }
    }
  }, [status, videoOn, remoteVideoOn, !!remoteUser?.videoTrack, !!localTracks.current.videoTrack, localVideoRef.current, remoteVideoRef.current]);

  const joinChannel = async () => {
    if (isJoining.current || agoraClient.connectionState !== 'DISCONNECTED') return;
    
    if (!AGORA_APP_ID || AGORA_APP_ID === "YOUR_AGORA_APP_ID") {
      setConfigError("خطأ في الإعدادات: معرف Agora غير صحيح.");
      return;
    }

    try {
      isJoining.current = true;
      
      // Start camera/mic init early
      const trackPromises: Promise<any>[] = [];
      trackPromises.push(AgoraRTC.createMicrophoneAudioTrack({ 
        encoderConfig: 'high_quality',
        AEC: true,
        ANS: true,
        AGC: true,
        ANS_MOD: 'noise_reduction'
      } as any));

      if (call.type === 'video') {
        trackPromises.push(AgoraRTC.createCameraVideoTrack({ 
          encoderConfig: '1080p_2',
          optimizationMode: 'detail' 
        }));
      }

      // Parallel Join and Track Creation
      const [tracks, joinResult] = await Promise.all([
        Promise.all(trackPromises),
        agoraClient.join(AGORA_APP_ID, call.channelId, null, user?.uid)
      ]);

      const [audioTrack, videoTrack] = tracks;
      localTracks.current.audioTrack = audioTrack;
      
      if (videoTrack) {
        await videoTrack.setBeautyEffect(true, {
          lighteningContrastLevel: 1,
          lighteningLevel: 0.6,
          smoothnessLevel: 0.5,
          rednessLevel: 0.1
        });
        localTracks.current.videoTrack = videoTrack;
      }

      // Publish immediately
      const publishPromises = [];
      if (localTracks.current.audioTrack) publishPromises.push(agoraClient.publish(localTracks.current.audioTrack));
      if (localTracks.current.videoTrack) publishPromises.push(agoraClient.publish(localTracks.current.videoTrack));
      await Promise.all(publishPromises);
      
      agoraClient.on('user-published', async (user, mediaType) => {
        try {
          await agoraClient.subscribe(user, mediaType);
          if (mediaType === 'video') {
            setRemoteUser(user);
            setRemoteVideoOn(true);
          }
          if (mediaType === 'audio') {
            user.audioTrack?.play();
          }
        } catch (e) {
          console.error("Subscription Error:", e);
        }
      });

      agoraClient.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video') setRemoteVideoOn(false);
      });

      agoraClient.on('user-left', () => handleHangup());
      agoraClient.on('network-quality', (q) => setConnectionQuality(q.downlinkNetworkQuality));
      agoraClient.on('connection-state-change', (cur) => setIsReconnecting(cur === 'RECONNECTING'));

    } catch (err: any) {
      console.error("Join Channel Error:", err);
      if (err.name === 'NotAllowedError' || err.message?.includes('PERMISSION_DENIED')) {
        setPermissionError(call.type === 'video' ? 'camera' : 'mic');
      } else {
        handleHangup();
      }
    } finally {
      isJoining.current = false;
    }
  };

  const leaveChannel = async () => {
    try {
      if (localTracks.current.videoTrack) { localTracks.current.videoTrack.stop(); localTracks.current.videoTrack.close(); localTracks.current.videoTrack = undefined; }
      if (localTracks.current.audioTrack) { localTracks.current.audioTrack.stop(); localTracks.current.audioTrack.close(); localTracks.current.audioTrack = undefined; }
      if (agoraClient.connectionState !== 'DISCONNECTED') await agoraClient.leave();
      agoraClient.removeAllListeners();
      setRemoteUser(null);
    } catch (e) {}
  };

  const handleAccept = async () => {
    ringtone.current?.pause();
    await updateDoc(doc(db, 'calls', call.id), { status: 'accepted' });
    setStatus('connected');
    await joinChannel();
  };

  const handleHangup = async () => {
    ringtone.current?.pause();
    const finalStatus = status === 'ringing' ? (isIncoming ? 'rejected' : 'ended') : 'ended';
    try {
      await updateDoc(doc(db, 'calls', call.id), { 
        status: finalStatus,
        endedAt: serverTimestamp(),
        duration: callDuration,
        endedBy: user?.uid || 'unknown'
      });
      // Also update my busy state immediately
      if (user) await updateDoc(doc(db, 'users', user.uid), { isInCall: false });
    } catch (e) {
      console.error("Hangup Error:", e);
    }
    await leaveChannel();
    onEnd();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ 
        opacity: 1, 
        width: isMinimized ? 300 : "100%",
        height: isMinimized ? 200 : "100vh",
        bottom: isMinimized ? 20 : 0,
        right: isMinimized ? 20 : 0,
        borderRadius: isMinimized ? 32 : 0,
        scale: isMinimized ? 0.9 : 1
      }}
      className={cn(
        "fixed z-[100] bg-[#050505] overflow-hidden select-none flex flex-col",
        isMinimized ? "cursor-move shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-white/10" : "inset-0"
      )}
    >
      {/* Recipe 7: Immersive Cinematic Canvas */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {remoteVideoOn && remoteUser?.videoTrack ? (
             <motion.div 
               key="remote-video"
               initial={{ opacity: 0, scale: 1.2, filter: "blur(20px)" }}
               animate={{ opacity: 1, scale: 1.02, filter: "blur(0px)" }}
               exit={{ opacity: 0, scale: 1.2, filter: "blur(20px)" }}
               transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
               ref={remoteVideoRef} 
               className="w-full h-full object-cover grayscale-[0.2] contrast-[1.1]" 
             />
          ) : (
             <motion.div 
               key="remote-placeholder"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="w-full h-full relative flex items-center justify-center bg-black"
             >
                {/* Advanced Neural Background Mesh */}
                <div className="absolute inset-0 overflow-hidden opacity-40">
                   <motion.div 
                     animate={{ 
                       rotate: [0, 90, 180, 270, 360],
                       scale: [1, 1.2, 1, 0.8, 1],
                       borderRadius: ["40%", "50%", "30%", "40%", "40%"]
                     }}
                     transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                     className="absolute top-[-20%] left-[-20%] w-[120%] h-[120%] bg-[conic-gradient(from_0deg,transparent,#1e40af,transparent,#3b82f6,transparent)] opacity-20 blur-[120px]"
                   />
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_70%)]" />
                   <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
                </div>

                <div className="relative flex flex-col items-center">
                   <div className="relative group">
                      <motion.div 
                        animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0.4, 0.2] }}
                        transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                        className="absolute inset-[-60px] bg-blue-500/10 rounded-full blur-[100px]"
                      />
                      <div className="absolute inset-[-8px] rounded-[48px] p-[2px] bg-gradient-to-tr from-white/10 via-white/5 to-transparent animate-premium-shimmer" />
                      
                      <Avatar className={cn(
                        "border-4 border-white/5 shadow-[0_0_80px_rgba(0,0,0,0.8)] transition-all duration-1000 relative z-10",
                        isMinimized ? "h-16 w-16" : "h-40 sm:h-56 md:h-72 w-40 sm:w-56 md:h-72 ring-1 ring-white/10"
                      )}>
                        <AvatarImage src={otherUser?.photoURL} className="object-cover" />
                        <AvatarFallback className="bg-gradient-to-br from-[#121212] via-[#080808] to-black text-white text-3xl sm:text-5xl font-black">
                           <span className="opacity-40">{otherUser?.displayName?.[0]}</span>
                        </AvatarFallback>
                      </Avatar>

                      {status === 'connected' && (
                        <motion.div 
                          className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-20"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <AudioPulse active={volume > 3} volume={volume} />
                        </motion.div>
                      )}
                   </div>
                </div>
             </motion.div>
          )}
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/95 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-50 pointer-events-none" />
      </div>

      {/* Top Header - Ultra-Modern Status Bar */}
      <div className={cn("relative z-20 w-full flex flex-col items-center transition-all duration-1000", isMinimized ? "mt-4" : "mt-8 sm:mt-16 px-6")}>
        <div className="flex flex-col items-center gap-4 text-center max-w-xl mx-auto">
          {!isMinimized && (
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="px-5 py-2 bg-white/[0.03] backdrop-blur-2xl rounded-2xl border border-white/5 shadow-2xl flex items-center gap-4 group">
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] font-black text-white/40 tracking-[0.3em] uppercase">Secure Link</span>
                 </div>
                 <div className="h-4 w-[1px] bg-white/10" />
                 <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity" />
                    <span className="text-[10px] font-black text-white/40 tracking-[0.3em] uppercase">End-to-End Encrypted</span>
                 </div>
              </div>
            </motion.div>
          )}

          <div className="relative">
            <h2 className={cn(
              "text-white font-black tracking-tighter drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all leading-tight", 
              isMinimized ? "text-xl" : "text-4xl sm:text-6xl md:text-7xl lg:text-8xl"
            )}>
              {otherUser?.displayName}
            </h2>
            {status === 'connected' && !isMinimized && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute -top-6 -right-12"
              >
                 <div className="px-2 py-0.5 bg-blue-500 rounded-md shadow-lg shadow-blue-500/20">
                    <span className="text-[8px] font-black text-white uppercase tracking-tighter">LIVE</span>
                 </div>
              </motion.div>
            )}
          </div>

          {!isMinimized && (
             <div className="flex flex-col items-center gap-6 mt-4">
                {status === 'connected' ? (
                   <div className="flex flex-col items-center gap-4">
                      <div className="flex items-center gap-8">
                         <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">Duration</span>
                            <span className="font-mono text-blue-400 font-black tracking-[0.2em] text-lg sm:text-xl">
                               {formatTime(callDuration)}
                            </span>
                         </div>
                         <div className="h-8 w-[1px] bg-white/5" />
                         <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">Quality</span>
                            <ConnectionStatus quality={connectionQuality} />
                         </div>
                      </div>
                   </div>
                ) : (
                   <div className="flex flex-col items-center gap-2">
                      <div className="flex gap-1.5 h-1">
                         {[1,2,3].map(i => (
                           <motion.div 
                             key={i}
                             animate={{ opacity: [0.2, 1, 0.2] }}
                             transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                             className="w-8 h-full bg-blue-500/40 rounded-full"
                           />
                         ))}
                      </div>
                      <p className="text-white/30 text-[10px] sm:text-[12px] font-black tracking-[0.4em] uppercase py-4">
                         {isIncoming ? 'Incoming Wave Detected' : 'Establishing Secure Node...'}
                      </p>
                   </div>
                )}
             </div>
          )}
        </div>
      </div>

      {/* Local Preview Window (Floating Studio Frame) */}
      <AnimatePresence mode="wait">
        {status === 'connected' && (
           <motion.div 
             key="local-preview-container"
             drag={!isMinimized}
             dragConstraints={{ left: -400, right: 400, top: -400, bottom: 400 }}
             dragElastic={0.05}
             initial={{ opacity: 0, scale: 0.8, x: 20 }}
             animate={{ opacity: 1, scale: 1, x: 0 }}
             whileDrag={{ scale: 1.02, boxShadow: "0 40px 100px rgba(0,0,0,0.6)" }}
             className={cn(
                "absolute bg-[#0a0a0a] rounded-[32px] sm:rounded-[48px] overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.6)] z-30 border border-white/10 ring-1 ring-white/5 transition-all cursor-move group/local",
                isMinimized ? "bottom-4 right-4 w-20 h-28" : "top-6 right-6 sm:top-10 sm:right-10 w-36 sm:w-56 h-52 sm:h-80"
             )}
           >
              <AnimatePresence mode="wait">
                {videoOn ? (
                   <motion.div 
                     key="local-video"
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     ref={localVideoRef} 
                     className="w-full h-full object-cover scale-[1.02]" 
                   />
                ) : (
                   <motion.div 
                     key="local-placeholder"
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     className="w-full h-full flex flex-col items-center justify-center bg-[#080808]"
                   >
                      <Avatar className="h-16 w-16 sm:h-24 sm:w-24 border-2 border-white/5 shadow-2xl mb-4 group-hover/local:scale-110 transition-transform duration-700">
                        <AvatarImage src={profile?.photoURL} className="object-cover" />
                        <AvatarFallback className="bg-neutral-900 text-white font-black text-xl">
                          {profile?.displayName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                   </motion.div>
                )}
              </AnimatePresence>
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between p-4 sm:p-6 opacity-0 group-hover/local:opacity-100 transition-opacity">
                 {!isMinimized && (
                   <>
                    <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-3xl text-white border border-white/10 hover:bg-white/20 transition-all">
                       <RotateCw className="h-4 w-4" />
                    </Button>
                    <div className="flex gap-1">
                       <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                    </div>
                   </>
                 )}
              </div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Actions Hub - The Command Hub */}
      <div className={cn("mt-auto relative z-30 w-full flex flex-col items-center pb-12 sm:pb-20 transition-all duration-1000", isMinimized ? "scale-75 pb-4" : "px-4 sm:px-8")}>
         <AnimatePresence mode="wait">
           {status === 'ringing' && isIncoming ? (
              <motion.div 
                key="incoming-actions"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="flex gap-16 sm:gap-32 items-center"
              >
                 <div className="flex flex-col items-center gap-6">
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                      <Button 
                        onClick={handleHangup}
                        className="h-20 w-20 sm:h-28 sm:w-28 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white shadow-2xl transition-all border-2 border-red-500/20 group"
                      >
                        <PhoneOff className="h-10 w-10 group-hover:rotate-[135deg] transition-transform duration-500" />
                      </Button>
                    </motion.div>
                    <span className="text-[10px] sm:text-[12px] font-black text-red-500 uppercase tracking-[0.4em] text-center drop-shadow-md">Decline</span>
                 </div>

                 <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                      <div className="absolute inset-[-40px] bg-blue-500/20 rounded-full animate-ping opacity-30" />
                      <div className="absolute inset-[-60px] bg-blue-500/10 rounded-full animate-pulse blur-3xl" />
                      <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}>
                        <Button 
                            onClick={handleAccept}
                            className="h-24 w-24 sm:h-36 sm:w-36 rounded-full bg-blue-500 hover:bg-blue-600 shadow-[0_30px_80px_rgba(59,130,246,0.5)] relative z-10 border-4 border-white/20"
                        >
                            {call.type === 'video' ? <Video className="h-10 w-10 sm:h-16 sm:w-16 text-white" /> : <Phone className="h-10 w-10 sm:h-16 sm:w-16 text-white" />}
                        </Button>
                      </motion.div>
                    </div>
                    <span className="text-[10px] sm:text-[12px] font-black text-blue-400 uppercase tracking-[0.5em] text-center animate-premium-shimmer">Accept Wave</span>
                 </div>
              </motion.div>
           ) : (
              <motion.div 
                key="active-actions"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="flex items-center gap-6 sm:gap-10 bg-white/[0.02] backdrop-blur-3xl p-4 sm:p-6 rounded-[50px] sm:rounded-[60px] border border-white/5 shadow-[0_50px_100px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
              >
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className={cn(
                      "h-14 w-14 sm:h-20 sm:w-20 rounded-full transition-all duration-500 border border-transparent shadow-xl", 
                      micOn ? "bg-white/[0.05] text-white hover:bg-white/[0.1] hover:scale-110" : "bg-red-500/20 text-red-500 border-red-500/30 scale-95"
                    )}
                    onClick={() => { setMicOn(!micOn); localTracks.current.audioTrack?.setEnabled(!micOn); }}
                  >
                    {micOn ? <Mic className="h-6 w-6 sm:h-10 w-10" /> : <MicOff className="h-6 w-6 sm:h-10 w-10" />}
                  </Button>

                  {call.type === 'video' && (
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className={cn(
                        "h-14 w-14 sm:h-20 sm:w-20 rounded-full transition-all duration-500 border border-transparent shadow-xl", 
                        videoOn ? "bg-white/[0.05] text-white hover:bg-white/[0.1] hover:scale-110" : "bg-red-500/20 text-red-500 border-red-500/30 scale-95"
                      )}
                      onClick={() => { setVideoOn(!videoOn); localTracks.current.videoTrack?.setEnabled(!videoOn); }}
                    >
                      {videoOn ? <Video className="h-6 w-6 sm:h-10 w-10" /> : <VideoOff className="h-6 w-6 sm:h-10 w-10" />}
                    </Button>
                  )}

                  <motion.div 
                    whileHover={{ scale: 1.05, rotate: 10 }} 
                    whileTap={{ scale: 0.9, rotate: -10 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  >
                    <Button 
                      onClick={handleHangup}
                      className="h-18 w-28 sm:h-24 sm:w-44 rounded-3xl sm:rounded-[44px] bg-red-600 hover:bg-red-700 shadow-[0_25px_60px_rgba(220,38,38,0.4)] transition-all border-2 border-white/10 flex items-center justify-center p-0 overflow-hidden group"
                    >
                       <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                       <PhoneOff className="h-10 w-10 sm:h-14 sm:w-14 text-white relative z-10 group-hover:rotate-[135deg] transition-transform duration-700" />
                    </Button>
                  </motion.div>

                  {!isMinimized && (
                     <div className="hidden lg:flex items-center gap-4">
                        <Button size="icon" variant="ghost" className="h-20 w-20 rounded-full bg-white/[0.03] text-white hover:bg-white/[0.08] transition-all">
                            <Volume2 className="h-9 w-9 opacity-40 hover:opacity-100" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-20 w-20 rounded-full bg-white/[0.03] text-white hover:bg-white/[0.08] transition-all">
                            <Settings2 className="h-9 w-9 opacity-40 hover:opacity-100" />
                        </Button>
                     </div>
                  )}
              </motion.div>
           )}
         </AnimatePresence>
      </div>

      {/* Config Error Handling Overlay */}
      <AnimatePresence>
        {configError && (
           <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="absolute inset-0 z-[130] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8"
           >
              <div className="max-w-xs text-center">
                 <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-8">
                    <Settings2 className="h-10 w-10 text-amber-500" />
                 </div>
                 <h3 className="text-2xl font-black text-white mb-4 tracking-tight">إعدادات مطلوبة</h3>
                 <p className="text-white/60 text-[11px] font-bold leading-relaxed mb-10 tracking-widest uppercase">
                    {configError}
                 </p>
                 <Button 
                     variant="ghost" 
                     onClick={handleHangup}
                     className="w-full h-14 text-white hover:bg-white/5 font-black uppercase tracking-widest border border-white/10 rounded-2xl"
                 >
                    إغلاق
                 </Button>
              </div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Permission Error Handling Overlay */}
      <AnimatePresence>
        {permissionError && (
           <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="absolute inset-0 z-[120] bg-black/80 backdrop-blur-3xl flex items-center justify-center p-8"
           >
              <div className="max-w-xs text-center">
                 <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
                    <AlertTriangle className="h-10 w-10 text-red-500" />
                 </div>
                 <h3 className="text-2xl font-black text-white mb-4 tracking-tight">Access Required</h3>
                 <p className="text-white/40 text-[11px] font-bold leading-relaxed mb-10 tracking-widest uppercase">
                    Please enable camera and microphone access in your browser settings to continue.
                 </p>
                 <div className="flex flex-col gap-4">
                    <Button 
                        onClick={() => { setPermissionError(null); joinChannel(); }}
                        className="w-full h-14 bg-accent-primary hover:bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest"
                    >
                        Try Again
                    </Button>
                    <Button 
                        variant="ghost" 
                        onClick={handleHangup}
                        className="w-full h-14 text-white/20 hover:text-white/40 font-black uppercase tracking-widest"
                    >
                        Cancel Call
                    </Button>
                 </div>
              </div>
           </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
