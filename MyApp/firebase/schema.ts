// Firebase configuration and database schema

// Database Schema for VolunteerHub App

// Collections Structure:

// 1. USERS Collection
// Document ID: userId (auto-generated)
interface UserDocument {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'organizer';
  bio: string;
  phone: string;
  points: number;
  pointsSpent: number;
  avatar?: string;
  friends: string[]; // Array of user IDs
  createdAt: Date;
  updatedAt: Date;
  // Additional fields for organizers
  organizationName?: string;
  verified?: boolean;
  avatarKey?: string;
}

// 2. EVENTS Collection
// Document ID: eventId (auto-generated)
interface EventDocument {
  id: string;
  name: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  date: Date;
  duration: number; // Duration in hours
  maxVolunteers: number;
  currentVolunteers: number;
  pointsReward: number;
  organizerId: string; // Reference to user
  organizerName: string;
  qrCode: string; // Unique QR code for check-in
  checkInCode: string; // Short text code for manual check-in (max 8 chars)
  status: 'active' | 'completed' | 'cancelled';
  volunteers: string[]; // Array of user IDs who joined
  createdAt: Date;
  updatedAt: Date;
  // Additional fields
  category: 'urban' | 'beach' | 'forest' | 'ocean' | 'climate' | 'community' | 'education' | 'health' | 'wildlife' | 'conservation' | 'other';
  requirements?: string[];
  imageUrl?: string;
}

// 3. MESSAGES Collection
// Document ID: messageId (auto-generated)
interface MessageDocument {
  id: string;
  senderId: string;
  receiverId?: string; // Optional for event messages
  eventId?: string; // Optional for event messages
  content: string;
  timestamp: Date;
  isRead: boolean;
  type: 'text' | 'image' | 'event_invite';
  chatType: 'private' | 'event'; // Distinguish between private and event chats
}

// 4. FRIEND_REQUESTS Collection
// Document ID: requestId (auto-generated)
interface FriendRequestDocument {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'declined';
  timestamp: Date;
}

// 5. EVENT_ATTENDANCE Collection
// Document ID: attendanceId (auto-generated)
interface EventAttendanceDocument {
  id: string;
  eventId: string;
  userId: string;
  checkInTime: Date;
  checkOutTime?: Date;
  pointsEarned: number;
  qrCodeScanned: string;
}

// 6. CHECK_INS Collection
// Document ID: checkInId (auto-generated)
interface CheckInDocument {
  id: string;
  eventId: string;
  userId: string;
  checkInTime: Date;
  checkInMethod: 'qr_code' | 'manual_code';
  pointsAwarded: boolean; // Whether points have been awarded for this check-in
}

// 7. REWARDS Collection
// Document ID: rewardId (auto-generated)
interface RewardDocument {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  category: 'food' | 'merchandise' | 'experience' | 'badge';
  imageUrl?: string;
  isActive: boolean;
  redemptionCode?: string; // For real-world rewards
}

// 7. USER_REWARDS Collection (Redemptions)
// Document ID: redemptionId (auto-generated)
interface UserRewardDocument {
  id: string;
  userId: string;
  rewardId: string;
  pointsSpent: number;
  redemptionDate: Date;
  status: 'pending' | 'redeemed' | 'expired';
  redemptionCode?: string;
}

// 8. NOTIFICATIONS Collection
// Document ID: notificationId (auto-generated)
interface NotificationDocument {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'friend_request' | 'friend_request_accepted' | 'event_reminder' | 'points_earned' | 'event_cancelled' | 'general';
  isRead: boolean;
  timestamp: Date;
  data?: any; // Additional data for specific notification types
}

// Firebase Security Rules (firestore.rules)
const securityRules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Events are readable by all authenticated users, writable by organizers
    match /events/{eventId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        resource.data.organizerId == request.auth.uid;
    }
    
    // Messages are readable/writable by sender and receiver
    match /messages/{messageId} {
      allow read, write: if request.auth != null && 
        (resource.data.senderId == request.auth.uid || 
         resource.data.receiverId == request.auth.uid);
    }
    
    // Friend requests are readable/writable by involved users
    match /friend_requests/{requestId} {
      allow read, write: if request.auth != null && 
        (resource.data.fromUserId == request.auth.uid || 
         resource.data.toUserId == request.auth.uid);
    }
    
    // Event attendance is readable by user and event organizer
    match /event_attendance/{attendanceId} {
      allow read: if request.auth != null && 
        (resource.data.userId == request.auth.uid || 
         get(/databases/$(database)/documents/events/$(resource.data.eventId)).data.organizerId == request.auth.uid);
      allow write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    
    // Rewards are readable by all, redemptions by user only
    match /rewards/{rewardId} {
      allow read: if request.auth != null;
    }
    
    match /user_rewards/{redemptionId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    
    // Notifications are readable/writable by user only
    match /notifications/{notificationId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
  }
}
`;

// Client-side helper functions for business logic
export const clientSideHelpers = {
  // Generate QR code for events
  generateQRCode: (eventId: string): string => {
    return `EVENT_${eventId}_${Date.now()}`;
  },

  // Generate short check-in code (max 8 characters)
  generateCheckInCode: (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Check if user can join event
  canJoinEvent: (event: EventDocument, userId: string): boolean => {
    return event.status === 'active' && 
           event.currentVolunteers < event.maxVolunteers && 
           !event.volunteers.includes(userId);
  },

  // Check if user has enough points for reward
  canRedeemReward: (userPoints: number, rewardCost: number): boolean => {
    return userPoints >= rewardCost;
  }
};

export {
  UserDocument,
  EventDocument,
  MessageDocument,
  FriendRequestDocument,
  EventAttendanceDocument,
  CheckInDocument,
  RewardDocument,
  UserRewardDocument,
  NotificationDocument,
  securityRules
};