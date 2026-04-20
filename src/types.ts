export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  specialId: string;
  isOnline: boolean;
  isInCall?: boolean;
  lastSeen: Date;
  bio?: string;
  security?: {
    pin?: string;
    isEnabled: boolean;
    lockDelay?: number;
    updatedAt?: Date;
  };
  notifications?: {
    messageSound?: string;
    callSound?: string;
    videoCallSound?: string;
    vibrate?: boolean;
    enabled?: boolean;
  };
  theme?: 'blue' | 'purple' | 'emerald' | 'rose' | 'amber' | 'dark';
  fcmTokens?: string[];
  appearance?: {
    chatBackground?: string;
    bubbleStyle?: 'modern' | 'glass' | 'classic';
  };
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: any;
  type: 'text' | 'image' | 'audio' | 'video';
  read?: boolean;
  isEdited?: boolean;
  editedAt?: any;
  deletedFor?: string[];
  reactions?: Record<string, string[]>; // emoji -> array of uids
  replyTo?: {
    id: string;
    text: string;
    senderId: string;
  };
  audioUrl?: string;
  duration?: number;
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageSenderId?: string;
  lastMessageRead?: boolean;
  updatedAt: any;
  otherUser?: UserProfile;
  unreadCount?: Record<string, number>;
  typing?: Record<string, boolean>;
  isPinned?: boolean;
  pinnedAt?: any;
  pinnedMessageId?: string;
  pinnedMessageText?: string;
}

export interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';
  channelId: string;
  participants: string[];
  createdAt: any;
  endedAt?: any;
  duration?: number;
  endedBy?: string;
  lastHeartbeat?: any;
  seen?: boolean;
}

export interface Block {
  id: string;
  blockedUserId: string;
  blockedAt: any;
  expiresAt?: any; // null for permanent
  unblockRequestCount: number;
  lastRequestAt?: any;
}
