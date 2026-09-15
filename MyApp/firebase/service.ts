// Client-side Firebase service for VolunteerHub
// All business logic runs on the client side

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  increment,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./config";
import { clientSideHelpers } from "./schema";
import { onSnapshot } from "firebase/firestore";
import {
  UserDocument,
  EventDocument,
  MessageDocument,
  FriendRequestDocument,
  EventAttendanceDocument,
  RewardDocument,
  UserRewardDocument,
  NotificationDocument,
} from "./schema";

interface FriendRequestWithNames extends FriendRequestDocument {
  fromUserName: string;
  toUserName: string;
}

export class FirebaseService {
  // =========================
  // User Management
  // =========================
  static async createUser(userData: UserDocument): Promise<string> {
    const docRef = doc(db, "users", userData.id);
    await setDoc(docRef, {
      ...userData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return userData.id;
  }

  static async getUser(userId: string): Promise<UserDocument | null> {
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as UserDocument;
    }
    return null;
  }

  static async updateUser(
    userId: string,
    updates: Partial<UserDocument>
  ): Promise<void> {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  // =========================
  // Follow System (Auto-friend on follow; Unfriend on unfollow)
  // =========================
  static async isFollowing(
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) return false;
      const data = userDoc.data() as any;
      const following: string[] = data.following || [];
      return following.includes(targetUserId);
    } catch (e) {
      console.error("isFollowing error:", e);
      return false;
    }
  }

  /**
   * Auto-friend behavior:
   * - Add to following/followers lists.
   * - Ensure both users are in each other's friends.
   * - Convert any pending friend_requests between the pair to "accepted".
   */
  static async followUser(
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    try {
      if (userId === targetUserId) return false;

      const userRef = doc(db, "users", userId);
      const targetRef = doc(db, "users", targetUserId);

      const batch = writeBatch(db);

      // 1) follow lists
      batch.update(userRef, {
        following: arrayUnion(targetUserId),
        updatedAt: serverTimestamp(),
      });
      batch.update(targetRef, {
        followers: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });

      // 2) auto-friend lists (bi-directional)
      batch.update(userRef, {
        friends: arrayUnion(targetUserId),
        updatedAt: serverTimestamp(),
      });
      batch.update(targetRef, {
        friends: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });

      // 3) flip any pending friend requests between them to accepted
      const qAtoB = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", userId),
        where("toUserId", "==", targetUserId)
      );
      const qBtoA = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", targetUserId),
        where("toUserId", "==", userId)
      );

      const [snapAtoB, snapBtoA] = await Promise.all([getDocs(qAtoB), getDocs(qBtoA)]);
      [...snapAtoB.docs, ...snapBtoA.docs].forEach((d) => {
        const data = d.data() as any;
        if (data.status === "pending") {
          batch.update(d.ref, { status: "accepted", updatedAt: serverTimestamp() });
        }
      });

      await batch.commit();

      // Optional: notify target
      await this.createNotification(targetUserId, {
        title: "New Follower",
        message: "Someone started following you.",
        type: "follow",
        isRead: false,
        timestamp: new Date(),
      });

      return true;
    } catch (e) {
      console.error("followUser error:", e);
      return false;
    }
  }

  /**
   * Unfollow + Unfriend:
   * - Remove following/followers.
   * - Also remove friendship both ways and cancel any open requests either direction.
   *   (Matches UX: unfollow means you also stop being friends/chatting.)
   */
  static async unfollowUser(
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    try {
      const userRef = doc(db, "users", userId);
      const targetRef = doc(db, "users", targetUserId);

      const batch = writeBatch(db);

      // 1) remove follow links
      batch.update(userRef, {
        following: arrayRemove(targetUserId),
        updatedAt: serverTimestamp(),
      });
      batch.update(targetRef, {
        followers: arrayRemove(userId),
        updatedAt: serverTimestamp(),
      });

      // 2) remove friendship both ways
      batch.update(userRef, {
        friends: arrayRemove(targetUserId),
        updatedAt: serverTimestamp(),
      });
      batch.update(targetRef, {
        friends: arrayRemove(userId),
        updatedAt: serverTimestamp(),
      });

      // 3) cancel any friend_requests both directions
      const q1 = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", userId),
        where("toUserId", "==", targetUserId)
      );
      const q2 = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", targetUserId),
        where("toUserId", "==", userId)
      );

      const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      [...s1.docs, ...s2.docs].forEach((reqDoc) => {
        batch.update(reqDoc.ref, { status: "cancelled", updatedAt: serverTimestamp() });
      });

      await batch.commit();
      return true;
    } catch (e) {
      console.error("unfollowUser error:", e);
      return false;
    }
  }

  // =========================
  // Event Management
  // =========================
  static async createEvent(
    eventData: Omit<EventDocument, "id" | "qrCode" | "checkInCode">
  ): Promise<{ eventId: string; checkInCode: string }> {
    const qrCode = clientSideHelpers.generateQRCode("temp"); // Will be updated with real ID
    const checkInCode = clientSideHelpers.generateCheckInCode();

    const docRef = await addDoc(collection(db, "events"), {
      ...eventData,
      qrCode: qrCode,
      checkInCode: checkInCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Update QR code with real event ID
    const finalQRCode = clientSideHelpers.generateQRCode(docRef.id);
    await updateDoc(docRef, { qrCode: finalQRCode });

    // Create chat room for the event
    await this.createEventChatRoom(docRef.id);

    return { eventId: docRef.id, checkInCode: checkInCode };
  }

  static async getEvents(): Promise<EventDocument[]> {
    const eventsQuery = query(
      collection(db, "events"),
      where("status", "==", "active")
    );
    const querySnapshot = await getDocs(eventsQuery);
    return querySnapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        date: data.date?.toDate ? data.date.toDate() : data.date,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      } as EventDocument;
    });
  }

  static async getAllEvents(): Promise<EventDocument[]> {
    const querySnapshot = await getDocs(collection(db, "events"));
    return querySnapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        date: data.date?.toDate ? data.date.toDate() : data.date,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      } as EventDocument;
    });
  }

  static async getEvent(eventId: string): Promise<EventDocument | null> {
    const docRef = doc(db, "events", eventId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        date: data.date?.toDate ? data.date.toDate() : data.date,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      } as EventDocument;
    }
    return null;
  }

  static async joinEvent(eventId: string, userId: string): Promise<boolean> {
    const eventRef = doc(db, "events", eventId);
    const eventDoc = await getDoc(eventRef);

    if (!eventDoc.exists()) return false;

    const eventData = eventDoc.data() as EventDocument;

    if (!clientSideHelpers.canJoinEvent(eventData, userId)) {
      return false;
    }

    await updateDoc(eventRef, {
      currentVolunteers: increment(1),
      volunteers: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });

    return true;
  }

  static async unjoinEvent(eventId: string, userId: string): Promise<boolean> {
    const eventRef = doc(db, "events", eventId);
    const eventDoc = await getDoc(eventRef);

    if (!eventDoc.exists()) return false;

    const eventData = eventDoc.data() as EventDocument;

    // Check if user is actually joined
    if (!eventData.volunteers.includes(userId)) {
      return false;
    }

    await updateDoc(eventRef, {
      currentVolunteers: increment(-1),
      volunteers: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });

    // Remove check-in status if user was checked in
    await this.removeUserCheckIn(eventId, userId);

    return true;
  }

  // Organizer functions
  static async updateEvent(
    eventId: string,
    updates: Partial<EventDocument>
  ): Promise<boolean> {
    try {
      const eventRef = doc(db, "events", eventId);
      await updateDoc(eventRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error("Update event error:", error);
      return false;
    }
  }

  static async markEventCompleted(eventId: string): Promise<boolean> {
    try {
      const eventRef = doc(db, "events", eventId);

      // Get event data to get points reward
      const eventDoc = await getDoc(eventRef);
      if (!eventDoc.exists()) {
        return false;
      }

      const eventData = eventDoc.data();
      const pointsReward = eventData.pointsReward;

      // Get all checked-in users for this event
      const checkInsQuery = query(
        collection(db, "check_ins"),
        where("eventId", "==", eventId),
        where("pointsAwarded", "==", false)
      );
      const checkInsSnapshot = await getDocs(checkInsQuery);

      // Award points to checked-in users
      const batch = writeBatch(db);

      for (const checkInDoc of checkInsSnapshot.docs) {
        const checkInData = checkInDoc.data();
        const userId = checkInData.userId;

        // Update user points
        const userRef = doc(db, "users", userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const newPoints = (userData.points || 0) + pointsReward;

          batch.update(userRef, {
            points: newPoints,
            updatedAt: serverTimestamp(),
          });

          // Mark check-in as points awarded
          batch.update(checkInDoc.ref, {
            pointsAwarded: true,
          });
        }
      }

      // Update event status
      batch.update(eventRef, {
        status: "completed",
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      return true;
    } catch (error) {
      console.error("Mark event completed error:", error);
      return false;
    }
  }

  static async cancelEvent(eventId: string): Promise<boolean> {
    try {
      const eventRef = doc(db, "events", eventId);
      await updateDoc(eventRef, {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error("Cancel event error:", error);
      return false;
    }
  }

  // =========================
  // Check-in Management
  // =========================
  static async checkInToEvent(
    eventId: string,
    userId: string,
    checkInMethod: "qr_code" | "manual_code"
  ): Promise<boolean> {
    try {
      // Check if user has already checked in
      const existingCheckInQuery = query(
        collection(db, "check_ins"),
        where("eventId", "==", eventId),
        where("userId", "==", userId)
      );
      const existingCheckInSnapshot = await getDocs(existingCheckInQuery);

      if (!existingCheckInSnapshot.empty) {
        console.log("User has already checked in to this event");
        return false;
      }

      // Create check-in record
      await addDoc(collection(db, "check_ins"), {
        eventId: eventId,
        userId: userId,
        checkInTime: serverTimestamp(),
        checkInMethod: checkInMethod,
        pointsAwarded: false,
      });

      return true;
    } catch (error) {
      console.error("Check-in error:", error);
      return false;
    }
  }

  static async checkInWithCode(
    eventId: string,
    userId: string,
    checkInCode: string
  ): Promise<boolean> {
    try {
      // Verify the check-in code matches the event
      const eventDoc = await getDoc(doc(db, "events", eventId));
      if (!eventDoc.exists()) {
        return false;
      }

      const eventData = eventDoc.data();
      if (eventData.checkInCode !== checkInCode) {
        return false;
      }

      // Check if user has joined the event
      if (!eventData.volunteers.includes(userId)) {
        return false;
      }

      return await this.checkInToEvent(eventId, userId, "manual_code");
    } catch (error) {
      console.error("Check-in with code error:", error);
      return false;
    }
  }

  static async getUserCheckInStatus(
    eventId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const checkInQuery = query(
        collection(db, "check_ins"),
        where("eventId", "==", eventId),
        where("userId", "==", userId)
      );
      const checkInSnapshot = await getDocs(checkInQuery);
      return !checkInSnapshot.empty;
    } catch (error) {
      console.error("Get check-in status error:", error);
      return false;
    }
  }

  static async removeUserCheckIn(
    eventId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const checkInQuery = query(
        collection(db, "check_ins"),
        where("eventId", "==", eventId),
        where("userId", "==", userId)
      );
      const checkInSnapshot = await getDocs(checkInQuery);

      if (!checkInSnapshot.empty) {
        const checkInDoc = checkInSnapshot.docs[0];
        await deleteDoc(checkInDoc.ref);
      }

      return true;
    } catch (error) {
      console.error("Remove check-in error:", error);
      return false;
    }
  }

  // =========================
  // Event queries for profiles
  // =========================
  static async getOrganizerEvents(
    organizerId: string
  ): Promise<EventDocument[]> {
    try {
      const eventsQuery = query(
        collection(db, "events"),
        where("organizerId", "==", organizerId)
      );
      const querySnapshot = await getDocs(eventsQuery);

      return querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          date: data.date?.toDate ? data.date.toDate() : data.date,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
        } as EventDocument;
      });
    } catch (error) {
      console.error("Get organizer events error:", error);
      return [];
    }
  }

  static async getUserEventHistory(userId: string): Promise<EventDocument[]> {
    try {
      const allEvents = await this.getAllEvents();
      const userEventHistory = allEvents.filter(
        (event) =>
          event.volunteers.includes(userId) &&
          (event.status === "completed" || event.status === "cancelled")
      );
      return userEventHistory;
    } catch (error) {
      console.error("Get user event history error:", error);
      return [];
    }
  }

  static async getOrganizerEventHistory(
    organizerId: string
  ): Promise<EventDocument[]> {
    try {
      const organizerEvents = await this.getOrganizerEvents(organizerId);
      const organizerEventHistory = organizerEvents.filter(
        (event) => event.status === "completed" || event.status === "cancelled"
      );
      return organizerEventHistory;
    } catch (error) {
      console.error("Get organizer event history error:", error);
      return [];
    }
  }

  // =========================
  // Friends & Requests
  // =========================
  static async getUserFriends(userId: string): Promise<UserDocument[]> {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        return [];
      }

      const userData = userDoc.data();
      const friendIds = userData.friends || [];

      if (friendIds.length === 0) {
        return [];
      }

      const friendPromises = friendIds.map((friendId: string) =>
        this.getUser(friendId)
      );
      const friends = await Promise.all(friendPromises);
      return friends.filter((friend) => friend !== null) as UserDocument[];
    } catch (error) {
      console.error("Get user friends error:", error);
      return [];
    }
  }

  static async areUsersFriends(
    userId1: string,
    userId2: string
  ): Promise<boolean> {
    try {
      const user1Doc = await getDoc(doc(db, "users", userId1));
      if (!user1Doc.exists()) {
        return false;
      }

      const user1Data = user1Doc.data();
      const friends = user1Data.friends || [];
      return friends.includes(userId2);
    } catch (error) {
      console.error("Check if users are friends error:", error);
      return false;
    }
  }

  // --- Messaging (unchanged) ---
  static async sendMessage(
    fromUserId: string,
    toUserId: string,
    content: string
  ): Promise<boolean> {
    try {
      await addDoc(collection(db, "messages"), {
        senderId: fromUserId,
        receiverId: toUserId,
        content,
        timestamp: new Date(),
        isRead: false,
        type: "text",
        chatType: "private",
      });
      return true;
    } catch (error) {
      console.error("Send message error:", error);
      return false;
    }
  }

  static async sendEventMessage(
    senderId: string,
    eventId: string,
    content: string
  ): Promise<boolean> {
    try {
      await addDoc(collection(db, "messages"), {
        senderId,
        eventId,
        content,
        timestamp: new Date(),
        isRead: false,
        type: "text",
        chatType: "event",
      });
      return true;
    } catch (error) {
      console.error("Send event message error:", error);
      return false;
    }
  }

  static async getMessagesBetweenUsers(
    userId1: string,
    userId2: string
  ): Promise<MessageDocument[]> {
    try {
      const messagesQuery1 = query(
        collection(db, "messages"),
        where("senderId", "==", userId1),
        where("receiverId", "==", userId2)
      );

      const messagesQuery2 = query(
        collection(db, "messages"),
        where("senderId", "==", userId2),
        where("receiverId", "==", userId1)
      );

      const [querySnapshot1, querySnapshot2] = await Promise.all([
        getDocs(messagesQuery1),
        getDocs(messagesQuery2),
      ]);

      const messages: MessageDocument[] = [];

      querySnapshot1.docs.forEach((docSnap) => {
        const data = docSnap.data();
        messages.push({
          id: docSnap.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
        } as MessageDocument);
      });

      querySnapshot2.docs.forEach((docSnap) => {
        const data = docSnap.data();
        messages.push({
          id: docSnap.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
        } as MessageDocument);
      });

      return messages.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (error) {
      console.error("Get messages between users error:", error);
      return [];
    }
  }

  static async getEventMessages(eventId: string): Promise<MessageDocument[]> {
    try {
      const messagesQuery = query(
        collection(db, "messages"),
        where("eventId", "==", eventId),
        where("chatType", "==", "event")
      );

      const querySnapshot = await getDocs(messagesQuery);
      const messages: MessageDocument[] = [];

      querySnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        messages.push({
          id: docSnap.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
        } as MessageDocument);
      });

      return messages.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (error) {
      console.error("Get event messages error:", error);
      return [];
    }
  }

  static async createEventChatRoom(eventId: string): Promise<boolean> {
    try {
      await addDoc(collection(db, "messages"), {
        senderId: "system",
        eventId,
        content: "Chat room has been created for this event",
        timestamp: new Date(),
        isRead: false,
        type: "text",
        chatType: "event",
      });
      return true;
    } catch (error) {
      console.error("Create event chat room error:", error);
      return false;
    }
  }

  static async getUserEventChats(
    userId: string
  ): Promise<
    { eventId: string; eventName: string; lastMessage: MessageDocument; unreadCount: number }[]
  > {
    try {
      const eventsQuery = query(
        collection(db, "events"),
        where("status", "==", "active")
      );

      const eventsSnapshot = await getDocs(eventsQuery);
      const eventChats: {
        eventId: string;
        eventName: string;
        lastMessage: MessageDocument;
        unreadCount: number;
      }[] = [];

      for (const eventDoc of eventsSnapshot.docs) {
        const eventData = eventDoc.data();
        const eventId = eventDoc.id;

        const isOrganizer = eventData.organizerId === userId;
        const isVolunteer = eventData.volunteers?.includes(userId) || false;

        if (isOrganizer || isVolunteer) {
          const messagesQuery = query(
            collection(db, "messages"),
            where("eventId", "==", eventId),
            where("chatType", "==", "event")
          );

          try {
            const messagesSnapshot = await getDocs(messagesQuery);

            if (!messagesSnapshot.empty) {
              const messages: MessageDocument[] = [];

              messagesSnapshot.docs.forEach((docSnap) => {
                const data = docSnap.data();
                messages.push({
                  id: docSnap.id,
                  ...data,
                  timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
                } as MessageDocument);
              });

              messages.sort(
                (a, b) =>
                  new Date(b.timestamp).getTime() -
                  new Date(a.timestamp).getTime()
              );
              const lastMessage = messages[0];

              const unreadCount = messages.filter(
                (msg) => msg.senderId !== userId && !msg.isRead
              ).length;

              eventChats.push({
                eventId,
                eventName: eventData.name,
                lastMessage,
                unreadCount,
              });
            }
          } catch (messageError) {
            console.error(
              `Error getting messages for event ${eventId}:`,
              messageError
            );
          }
        }
      }

      return eventChats.sort(
        (a, b) =>
          new Date(b.lastMessage.timestamp).getTime() -
          new Date(a.lastMessage.timestamp).getTime()
      );
    } catch (error) {
      console.error("Get user event chats error:", error);
      return [];
    }
  }

  static async markEventMessagesAsRead(
    userId: string,
    eventId: string
  ): Promise<boolean> {
    try {
      const messagesQuery = query(
        collection(db, "messages"),
        where("eventId", "==", eventId),
        where("chatType", "==", "event")
      );

      const querySnapshot = await getDocs(messagesQuery);
      const updatePromises: Promise<void>[] = [];

      querySnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.senderId !== userId && !data.isRead) {
          updatePromises.push(updateDoc(docSnap.ref, { isRead: true }));
        }
      });

      await Promise.all(updatePromises);
      return true;
    } catch (error) {
      console.error("Mark event messages as read error:", error);
      return false;
    }
  }

  static async getUserConversations(
    userId: string
  ): Promise<
    { userId: string; userName: string; lastMessage: MessageDocument; unreadCount: number }[]
  > {
    try {
      const sentMessagesQuery = query(
        collection(db, "messages"),
        where("senderId", "==", userId),
        where("chatType", "==", "private")
      );

      const receivedMessagesQuery = query(
        collection(db, "messages"),
        where("receiverId", "==", userId),
        where("chatType", "==", "private")
      );

      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        getDocs(sentMessagesQuery),
        getDocs(receivedMessagesQuery),
      ]);

      const conversations = new Map<
        string,
        {
          userId: string;
          userName: string;
          lastMessage: MessageDocument;
          unreadCount: number;
        }
      >();

      sentSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const message: MessageDocument = {
          id: docSnap.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
        } as MessageDocument;

        const otherUserId = message.receiverId;
        if (otherUserId && !conversations.has(otherUserId)) {
          conversations.set(otherUserId, {
            userId: otherUserId,
            userName: "Loading...",
            lastMessage: message,
            unreadCount: 0,
          });
        } else if (otherUserId) {
          const existing = conversations.get(otherUserId)!;
          if (new Date(message.timestamp) > new Date(existing.lastMessage.timestamp)) {
            existing.lastMessage = message;
          }
        }
      });

      receivedSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const message: MessageDocument = {
          id: docSnap.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
        } as MessageDocument;

        const otherUserId = message.senderId;
        if (!conversations.has(otherUserId)) {
          conversations.set(otherUserId, {
            userId: otherUserId,
            userName: "Loading...",
            lastMessage: message,
            unreadCount: message.isRead ? 0 : 1,
          });
        } else {
          const existing = conversations.get(otherUserId)!;
          if (new Date(message.timestamp) > new Date(existing.lastMessage.timestamp)) {
            existing.lastMessage = message;
          }
          if (!message.isRead) {
            existing.unreadCount++;
          }
        }
      });

      const conversationArray = Array.from(conversations.values());
      const userPromises = conversationArray.map(async (conversation) => {
        const user = await this.getUser(conversation.userId);
        return {
          ...conversation,
          userName: user?.name || "Unknown User",
        };
      });

      const conversationsWithNames = await Promise.all(userPromises);

      return conversationsWithNames.sort(
        (a, b) =>
          new Date(b.lastMessage.timestamp).getTime() -
          new Date(a.lastMessage.timestamp).getTime()
      );
    } catch (error) {
      console.error("Get user conversations error:", error);
      return [];
    }
  }

  static async markMessagesAsRead(
    fromUserId: string,
    toUserId: string
  ): Promise<boolean> {
    try {
      const messagesQuery = query(
        collection(db, "messages"),
        where("senderId", "==", fromUserId),
        where("receiverId", "==", toUserId),
        where("isRead", "==", false)
      );

      const querySnapshot = await getDocs(messagesQuery);
      const updatePromises = querySnapshot.docs.map((docSnap) =>
        updateDoc(docSnap.ref, { isRead: true })
      );

      await Promise.all(updatePromises);
      return true;
    } catch (error) {
      console.error("Mark messages as read error:", error);
      return false;
    }
  }

  // =========================
  // Friend Requests
  // =========================
  static async getAllFriendRequests(
    userId: string
  ): Promise<FriendRequestWithNames[]> {
    try {
      const [receivedRequests, sentRequests] = await Promise.all([
        this.getFriendRequestsReceived(userId),
        this.getFriendRequestsSent(userId),
      ]);

      const allRequests = [...receivedRequests, ...sentRequests];
      return allRequests.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error("Get all friend requests error:", error);
      return [];
    }
  }

  static async getFriendRequestsReceived(
    userId: string
  ): Promise<FriendRequestWithNames[]> {
    try {
      const requestsQuery = query(
        collection(db, "friend_requests"),
        where("toUserId", "==", userId),
        where("status", "==", "pending")
      );
      const querySnapshot = await getDocs(requestsQuery);
      const requests = querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
        } as FriendRequestDocument;
      });

      const requestsWithNames = await Promise.all(
        requests.map(async (request) => {
          const fromUser = await this.getUser(request.fromUserId);
          return {
            ...request,
            fromUserName: fromUser?.name || "Unknown User",
            toUserName: "You",
          };
        })
      );

      return requestsWithNames as FriendRequestWithNames[];
    } catch (error) {
      console.error("Get friend requests received error:", error);
      return [];
    }
  }

  static async getFriendRequestsSent(
    userId: string
  ): Promise<FriendRequestWithNames[]> {
    try {
      const requestsQuery = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", userId),
        where("status", "==", "pending")
      );
      const querySnapshot = await getDocs(requestsQuery);
      const requests = querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
        } as FriendRequestDocument;
      });

      const requestsWithNames = await Promise.all(
        requests.map(async (request) => {
          const toUser = await this.getUser(request.toUserId);
          return {
            ...request,
            fromUserName: "You",
            toUserName: toUser?.name || "Unknown User",
          };
        })
      );

      return requestsWithNames as FriendRequestWithNames[];
    } catch (error) {
      console.error("Get friend requests sent error:", error);
      return [];
    }
  }

  static async acceptFriendRequest(requestId: string): Promise<boolean> {
    try {
      const requestRef = doc(db, "friend_requests", requestId);
      const reqSnap = await getDoc(requestRef);
      if (!reqSnap.exists()) return false;

      const { fromUserId, toUserId } = reqSnap.data() as any;

      const batch = writeBatch(db);
      batch.update(requestRef, { status: "accepted", updatedAt: serverTimestamp() });
      batch.update(doc(db, "users", fromUserId), {
        friends: arrayUnion(toUserId),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, "users", toUserId), {
        friends: arrayUnion(fromUserId),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      await this.createNotification(fromUserId, {
        title: "Friend Request Accepted",
        message: "Your friend request was accepted!",
        type: "friend_request_accepted",
        isRead: false,
        timestamp: new Date(),
      });

      return true;
    } catch (e) {
      console.error("acceptFriendRequest error:", e);
      return false;
    }
  }

  static async declineFriendRequest(requestId: string): Promise<boolean> {
    try {
      const requestRef = doc(db, "friend_requests", requestId);
      await updateDoc(requestRef, {
        status: "declined",
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Decline friend request error:", error);
      return false;
    }
    return true;
  }

  static async checkFriendRequestStatus(
    fromUserId: string,
    toUserId: string
  ): Promise<"pending" | "accepted" | "declined" | "none" | "received"> {
    try {
      // Outgoing A->B
      const sentQ = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", fromUserId),
        where("toUserId", "==", toUserId)
      );
      const sentSnap = await getDocs(sentQ);
      if (!sentSnap.empty) {
        const data = sentSnap.docs[0].data();
        if (data.status === "pending") return "pending";
        if (data.status === "accepted") return "accepted";
        if (data.status === "declined") return "declined";
      }

      // Incoming B->A (only treat PENDING as "received")
      const recvQ = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", toUserId),
        where("toUserId", "==", fromUserId)
      );
      const recvSnap = await getDocs(recvQ);
      if (!recvSnap.empty) {
        const data = recvSnap.docs[0].data();
        if (data.status === "pending") return "received";
      }

      return "none";
    } catch (error) {
      console.error("Check friend request status error:", error);
      return "none";
    }
  }

  static async sendFriendRequest(
    fromUserId: string,
    toUserId: string
  ): Promise<boolean> {
    try {
      if (fromUserId === toUserId) return false;

      // Already friends?
      if (await this.areUsersFriends(fromUserId, toUserId)) {
        return false;
      }

      // Any existing request from A->B?
      const outQ = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", fromUserId),
        where("toUserId", "==", toUserId)
      );
      const outSnap = await getDocs(outQ);

      // Any existing request from B->A?
      const inQ = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", toUserId),
        where("toUserId", "==", fromUserId)
      );
      const inSnap = await getDocs(inQ);

      // If any pending in either direction, don't create a new one
      const pendingExists =
        outSnap.docs.some((d) => d.data().status === "pending") ||
        inSnap.docs.some((d) => d.data().status === "pending");

      if (pendingExists) return false;

      // Fresh pending request (allowed if old ones were declined/cancelled)
      await addDoc(collection(db, "friend_requests"), {
        fromUserId,
        toUserId,
        status: "pending",
        timestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await this.createNotification(toUserId, {
        title: "New Friend Request",
        message: "Someone wants to be your friend!",
        type: "friend_request",
        isRead: false,
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      console.error("Send friend request error:", error);
      return false;
    }
  }

  static async respondToFriendRequest(
    requestId: string,
    response: "accepted" | "declined"
  ): Promise<boolean> {
    try {
      const requestRef = doc(db, "friend_requests", requestId);
      const requestDoc = await getDoc(requestRef);

      if (!requestDoc.exists()) return false;

      const requestData = requestDoc.data() as FriendRequestDocument;

      await updateDoc(requestRef, {
        status: response,
        timestamp: serverTimestamp(),
      });

      if (response === "accepted") {
        await updateDoc(doc(db, "users", requestData.fromUserId), {
          friends: arrayUnion(requestData.toUserId),
          updatedAt: serverTimestamp(),
        });

        await updateDoc(doc(db, "users", requestData.toUserId), {
          friends: arrayUnion(requestData.fromUserId),
          updatedAt: serverTimestamp(),
        });
      }

      return true;
    } catch (error) {
      console.error("Respond to friend request error:", error);
      return false;
    }
  }

  // Remove friend (bi-directional) + cancel any existing friend requests either way
  static async removeFriend(userId: string, otherUserId: string): Promise<boolean> {
    try {
      const userRef = doc(db, "users", userId);
      const otherRef = doc(db, "users", otherUserId);

      const batch = writeBatch(db);
      batch.update(userRef, {
        friends: arrayRemove(otherUserId),
        updatedAt: serverTimestamp(),
      });
      batch.update(otherRef, {
        friends: arrayRemove(userId),
        updatedAt: serverTimestamp(),
      });

      // Cancel requests both directions (so re-sending works)
      const q1 = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", userId),
        where("toUserId", "==", otherUserId)
      );
      const q2 = query(
        collection(db, "friend_requests"),
        where("fromUserId", "==", otherUserId),
        where("toUserId", "==", userId)
      );

      const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);

      [...s1.docs, ...s2.docs].forEach((reqDoc) => {
        batch.update(reqDoc.ref, { status: "cancelled", updatedAt: serverTimestamp() });
      });

      await batch.commit();
      return true;
    } catch (e) {
      console.error("removeFriend error:", e);
      return false;
    }
  }

  // =========================
  // Rewards
  // =========================
  static async getRewards(): Promise<RewardDocument[]> {
    const querySnapshot = await getDocs(collection(db, "rewards"));
    return querySnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as RewardDocument[];
  }

  static async redeemReward(userId: string, rewardId: string): Promise<boolean> {
    try {
      const rewardRef = doc(db, "rewards", rewardId);
      const rewardDoc = await getDoc(rewardRef);

      if (!rewardDoc.exists()) return false;

      const rewardData = rewardDoc.data() as RewardDocument;

      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data() as UserDocument;

      if (!clientSideHelpers.canRedeemReward(userData.points, rewardData.pointsCost)) {
        return false;
      }

      await addDoc(collection(db, "user_rewards"), {
        userId: userId,
        rewardId: rewardId,
        pointsSpent: rewardData.pointsCost,
        redemptionDate: serverTimestamp(),
        status: "pending",
      });

      await updateDoc(userRef, {
        points: (userData.points || 0) - rewardData.pointsCost,
        pointsSpent: increment(rewardData.pointsCost),
        updatedAt: serverTimestamp(),
      });

      return true;
    } catch (error) {
      console.error("Redeem reward error:", error);
      return false;
    }
  }

  static async getUserRewards(userId: string): Promise<UserRewardDocument[]> {
    try {
      const userRewardsQuery = query(
        collection(db, "user_rewards"),
        where("userId", "==", userId)
      );
      const userRewardsSnapshot = await getDocs(userRewardsQuery);

      const rewards = userRewardsSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        redemptionDate: docSnap.data().redemptionDate?.toDate
          ? docSnap.data().redemptionDate.toDate()
          : docSnap.data().redemptionDate,
      })) as UserRewardDocument[];

      return rewards.sort(
        (a, b) => b.redemptionDate.getTime() - a.redemptionDate.getTime()
      );
    } catch (error) {
      console.error("Get user rewards error:", error);
      return [];
    }
  }

  static async getAvailableRewards(): Promise<RewardDocument[]> {
    try {
      const rewardsQuery = query(
        collection(db, "rewards"),
        where("isActive", "==", true)
      );
      const rewardsSnapshot = await getDocs(rewardsQuery);

      return rewardsSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as RewardDocument[];
    } catch (error) {
      console.error("Get available rewards error:", error);
      return [];
    }
  }

  // =========================
  // Notifications
  // =========================
  static async createNotification(
    userId: string,
    notificationData: Omit<NotificationDocument, "id" | "userId">
  ): Promise<string> {
    const docRef = await addDoc(collection(db, "notifications"), {
      userId: userId,
      ...notificationData,
      timestamp: serverTimestamp(),
    });
    return docRef.id;
  }

  static async getNotifications(userId: string): Promise<NotificationDocument[]> {
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      orderBy("timestamp", "desc"),
      limit(20)
    );

    const querySnapshot = await getDocs(notificationsQuery);
    return querySnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as NotificationDocument[];
  }

  static async markNotificationAsRead(notificationId: string): Promise<void> {
    const notificationRef = doc(db, "notifications", notificationId);
    await updateDoc(notificationRef, {
      isRead: true,
    });
  }
}
