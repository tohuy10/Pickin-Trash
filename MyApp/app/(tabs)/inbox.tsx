import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, TextInput, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/contexts/AuthContext";
import { FirebaseService } from "@/firebase/service";
import { FriendRequestDocument, MessageDocument, UserDocument } from "@/firebase/schema";
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { AVATARS, DEFAULT_AVATAR } from "@/constants/avatars";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isRead: boolean;
}

interface FriendRequestWithNames extends FriendRequestDocument {
  fromUserName: string;
  toUserName: string;
}

export default function Inbox() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'friends' | 'events' | 'requests'>('friends');
  const [newMessage, setNewMessage] = useState('');
  const [friends, setFriends] = useState<UserDocument[]>([]);
  const friendAvatarById = useMemo(() => {
  const m: Record<string, string | undefined> = {};
  friends.forEach(f => (m[f.id] = f.avatarKey));
  return m;
}, [friends]);
  const [userAvatarById, setUserAvatarById] = useState<Record<string, string | undefined>>({});
  const [conversations, setConversations] = useState<{userId: string, userName: string, lastMessage: MessageDocument, unreadCount: number}[]>([]);
  const [eventChats, setEventChats] = useState<{eventId: string, eventName: string, lastMessage: MessageDocument, unreadCount: number}[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequestWithNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tabLoading, setTabLoading] = useState<{[key: string]: boolean}>({});
  const EVENT_IMAGES: Record<string, any> = {
    urban: require("@/assets/event_pics/event_urban.png"),
    beach: require("@/assets/event_pics/event_beach.png"),
    forest: require("@/assets/event_pics/event_forest.png"),
    ocean: require("@/assets/event_pics/event_ocean.png"),
    climate: require("@/assets/event_pics/event_climate.png"),
    community: require("@/assets/event_pics/event_community.png"),
    education: require("@/assets/event_pics/event_education.png"),
    health: require("@/assets/event_pics/event_health.png"),
    wildlife: require("@/assets/event_pics/event_wildlife.png"),
    conservation: require("@/assets/event_pics/event_conservation.png"),
    other: require("@/assets/event_pics/event_other.png"),
    default: require("@/assets/images/main-logo.png"),
  };
  
  useEffect(() => {
  if (!friends.length) return;
  setUserAvatarById(prev => {
    const next = { ...prev };
    friends.forEach(f => { next[f.id] = f.avatarKey; });
    return next;
  });
  }, [friends]);

  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        loadTabData(activeTab);
      }
    }, [user, activeTab])
  );

  const loadAllData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Load all tabs data in parallel
      await Promise.all([
        loadFriendsData(),
        loadMessagesData(),
        loadRequestsData()
      ]);
    } catch (error) {
      console.error('Error loading all inbox data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async (tab: 'friends' | 'events' | 'requests') => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Check if data already exists for this tab
    const hasExistingData = (() => {
      switch (tab) {
        case 'friends':
          return friends.length > 0;
        case 'events':
          return conversations.length > 0 || eventChats.length > 0;
        case 'requests':
          return friendRequests.length > 0;
        default:
          return false;
      }
    })();

    // Only show loading if there's no existing data
    if (!hasExistingData) {
      setLoading(true);
    }
    setTabLoading(prev => ({ ...prev, [tab]: true }));
    
    try {
      switch (tab) {
        case 'friends':
          await loadFriendsData();
          break;
        case 'events':
          await loadMessagesData();
          break;
        case 'requests':
          await loadRequestsData();
          break;
      }
      
    } catch (error) {
      console.error(`Error loading ${tab} data:`, error);
    } finally {
      setTabLoading(prev => ({ ...prev, [tab]: false }));
      setLoading(false);
    }
  };

  const handleViewProfile = (userId: string) => {
      router.push(`/user-profile?userId=${userId}` as any);
  };

  const loadFriendsData = async () => {
    if (!user) return;
    
    const friendsList = await FirebaseService.getUserFriends(user.id);
    setFriends(friendsList);
  };

  const loadMessagesData = async () => {
    if (!user) return;
    
    // Load conversations
    const conversationsList = await FirebaseService.getUserConversations(user.id);
    setConversations(conversationsList);
    
    // Load event chats
    const eventChatsList = await FirebaseService.getUserEventChats(user.id);
    setEventChats(eventChatsList);
  };

  const loadRequestsData = async () => {
    if (!user) return;
    
    // Load all friend requests (both sent and received)
    const allRequests = await FirebaseService.getAllFriendRequests(user.id);
    setFriendRequests(allRequests);
  };

  const handleTabChange = async (tab: 'friends' | 'events' | 'requests') => {
    setActiveTab(tab);
    // Data will be loaded automatically by useEffect
  };

  const refreshCurrentTab = async () => {
    await loadTabData(activeTab);
  };

  // FIXME: Determine usage, else remove
  const onRefresh = async () => {
    setRefreshing(true);
    await loadTabData(activeTab);
    setRefreshing(false);
  };

  const handleAcceptFriendRequest = async (requestId: string) => {
    try {
      const success = await FirebaseService.acceptFriendRequest(requestId);
      if (success) {
        Alert.alert("Success", "Friend request accepted!");
        refreshCurrentTab(); // Reload to update the list
      } else {
        Alert.alert("Error", "Failed to accept friend request");
      }
    } catch (error) {
      console.error("Accept friend request error:", error);
      Alert.alert("Error", "Failed to accept friend request");
    }
  };

  const handleDeclineFriendRequest = async (requestId: string) => {
    try {
      const success = await FirebaseService.declineFriendRequest(requestId);
      if (success) {
        Alert.alert("Success", "Friend request declined");
        refreshCurrentTab(); // Reload to update the list
      } else {
        Alert.alert("Error", "Failed to decline friend request");
      }
    } catch (error) {
      console.error("Decline friend request error:", error);
      Alert.alert("Error", "Failed to decline friend request");
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Text style={styles.topBarTitle}>Inbox</Text>
        <TouchableOpacity>
          <IconSymbol name="bell.fill" size={24} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Tab Selector */}
        <View style={styles.tabSelector}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
            onPress={() => handleTabChange('friends')}
          >
            <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
              {user?.role === 'organizer' ? 'Followers' : 'Friends' }
              {/* Friends */}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'events' && styles.activeTab]}
            onPress={() => handleTabChange('events')}
          >
            <Text style={[styles.tabText, activeTab === 'events' && styles.activeTabText]}>
              Events
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
            onPress={() => handleTabChange('requests')}
          >
            <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
              Requests 
            </Text>
          </TouchableOpacity>
        </View>
        {/* TODO: Search Bar */}

      <ScrollView style={styles.content}>
        {activeTab === 'friends' ? (
          /* Friends Tab */
          loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading friends...</Text>
            </View>
          ) : friends.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No friends yet</Text>
              <Text style={styles.emptySubtext}>Add friends through events to start connecting!</Text>
            </View>
          ) : (
            // Updated Friends Message System
            friends.map((friend) => {
              const conversation = conversations.find(c => c.userId === friend.id);
              return (
                <TouchableOpacity 
                  key={friend.id} 
                  style={styles.friendItem}
                  onPress={() => router.push(`/chat?userId=${friend.id}` as any)}
                >
                  {/* Handles profile display on avatar click */}
                  <TouchableOpacity onPress={() => handleViewProfile(friend.id)}>
                    <Image
                      source={
                        friend.avatarKey && AVATARS[friend.avatarKey]
                        ? AVATARS[friend.avatarKey as keyof typeof AVATARS]
                        : AVATARS[DEFAULT_AVATAR]
                      }
                      style={styles.avatar}
                    />
                  </TouchableOpacity>
                  {/* Displays Chat Content */}
                  <View style={styles.friendContent}>
                    <View style={styles.conversationHeader}>
                      <Text style={styles.friendName}>{friend.name}</Text>
                      {/* Displays last msg date stamp */}
                      {conversation?.lastMessage && (
                        <Text style={styles.conversationTime}>
                          {new Date(conversation.lastMessage.timestamp).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    {/* Displays last msg */}
                    {conversation?.lastMessage ? (
                        <Text style={styles.conversationPreview} numberOfLines={1}>
                          {conversation.lastMessage.content}
                        </Text>
                    ) : (
                        <Text style={styles.conversationPreview}>No message yet</Text>
                    )}
                    {/* Unread Badge */}
                    {conversation?.unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {conversation?.unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* <TouchableOpacity 
                    style={styles.messageButton}
                    onPress={() => handleViewProfile(friend.id)}
                    // onPress={() => router.push(`/chat?userId=${friend.id}` as any)}
                  >
                    <IconSymbol name="person.fill" size={20} color="#3498db" />
                  </TouchableOpacity> */}
                </TouchableOpacity>  
              );
            })
          )
        ) : activeTab === 'events' ? (
          /* Events Tab */
          loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading conversations...</Text>
            </View>
          ) : (conversations.length === 0 && eventChats.length === 0) ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No conversations yet</Text>
              <Text style={styles.emptySubtext}>Start chatting with your friends or join events!</Text>
            </View>
          ) : (
            <ScrollView style={styles.messagesScrollView}>
              {/* Event Chats Section */}
              {eventChats.length > 0 && (
                <>
                  {eventChats.map((eventChat) => (
                    <TouchableOpacity 
                      key={`event-${eventChat.eventId}`} 
                      style={styles.conversationItem}
                      onPress={() => router.push(`/chat?eventId=${eventChat.eventId}` as any)}
                    >
                      <View style={styles.eventChatIcon}>
                        <IconSymbol name="calendar" size={20} color="#ffffffff" />
                      </View>
                      <View style={styles.conversationContent}>
                        <View style={styles.conversationHeader}>
                          {/* Truncates Event Titles > 22 chars */}
                          <Text style={styles.conversationName}>
                            {eventChat.eventName.length > 22
                            ? `${eventChat.eventName.slice(0, 22)}...`
                            : eventChat.eventName}
                          </Text>
                          <Text style={styles.conversationTime}>
                            {new Date(eventChat.lastMessage.timestamp).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text style={styles.conversationPreview} numberOfLines={1}>
                          {eventChat.lastMessage.content}
                        </Text>
                        {eventChat.unreadCount > 0 && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>{eventChat.unreadCount}</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          )
        ) : (
          /* Friend Requests Tab */
          loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading friend requests...</Text>
            </View>
          ) : friendRequests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No friend requests</Text>
              <Text style={styles.emptySubtext}>Join events and meet new people!</Text>
            </View>
          ) : (
            friendRequests.map((request) => {
              const isReceived = request.toUserId === user?.id;
              const otherId = isReceived ? request.fromUserId : request.toUserId;
              const key = userAvatarById[otherId];
            
              return (
                <TouchableOpacity 
                  key={request.id} 
                  style={styles.requestItem} 
                  onPress={() => handleViewProfile(otherId)}
                >
                  <Image
                    source={
                      key && AVATARS[key as keyof typeof AVATARS]
                        ? AVATARS[key as keyof typeof AVATARS]
                        : AVATARS[DEFAULT_AVATAR]
                    }
                    style={styles.avatar}
                  />
            
                  <View style={styles.requestContent}>
                    {/* TOP ROW: name on left, status/actions on right */}
                    <View style={styles.requestTopRow}>
                      <Text style={styles.requestName}>
                        {isReceived ? request.fromUserName : request.toUserName}
                      </Text>
                  
                      {isReceived ? (
                        <View style={styles.requestActionsRow}>
                          <TouchableOpacity
                            style={styles.acceptButton}
                            onPress={() => handleAcceptFriendRequest(request.id)}
                          >
                            <Text style={styles.acceptButtonText}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.declineButton}
                            onPress={() => handleDeclineFriendRequest(request.id)}
                          >
                            <Text style={styles.declineButtonText}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.requestStatusPill}>
                          <Text style={styles.requestStatusPillText}>Request Sent</Text>
                        </View>
                      )}
                    </View>
                    
                    {/* SECOND ROW: date under the name */}
                    <Text style={styles.requestTime}>
                      {new Date(request.timestamp).toLocaleDateString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })

            // friendRequests.map((request) => {
            //   const isReceived = request.toUserId === user?.id;
            //   const otherId = isReceived ? request.fromUserId : request.toUserId;
            //   const key = userAvatarById[otherId];

            //   return (
            //     <View key={request.id} style={styles.requestItem}>
            //       <Image
            //         source={
            //           key && AVATARS[key as keyof typeof AVATARS]
            //             ? AVATARS[key as keyof typeof AVATARS]
            //             : AVATARS[DEFAULT_AVATAR]
            //         }
            //         style={styles.avatar}
            //       />

            //       <View style={styles.requestContent}>
            //         <Text style={styles.requestName}>
            //           {isReceived ? request.fromUserName : request.toUserName}
            //         </Text>
            //         <Text style={styles.requestTime}>
            //           {new Date(request.timestamp).toLocaleDateString()}
            //         </Text>
            //         {isReceived ? (
            //           <View style={styles.requestActions}>
            //             <TouchableOpacity
            //               style={styles.acceptButton}
            //               onPress={() => handleAcceptFriendRequest(request.id)}
            //             >
            //               <Text style={styles.acceptButtonText}>Accept</Text>
            //             </TouchableOpacity>
            //             <TouchableOpacity
            //               style={styles.declineButton}
            //               onPress={() => handleDeclineFriendRequest(request.id)}
            //             >
            //               <Text style={styles.declineButtonText}>Decline</Text>
            //             </TouchableOpacity>
            //           </View>
            //         ) : (
            //           <View style={styles.requestStatus}>
            //             <Text style={styles.statusText}>Request Sent</Text>
            //           </View>
            //         )}
            //       </View>
            //     </View>
            //   );
            // })
          )
        )}
      </ScrollView>
    </View>
  );
}

export const options = {
  title: "Inbox",
  tabBarIcon: ({ color }: { color: string }) => (
    <IconSymbol size={28} name="tray.fill" color={color} />
  ),
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    backgroundColor: "#333",
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  tabSelector: {
    flexDirection: "row",
    // backgroundColor: "#f8f9fa",
    backgroundColor: "#e6e6e6",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
    borderRadius: 30,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  activeTab: {
    backgroundColor: "#27ae60",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  activeTabText: {
    color: "#fff",
  },
  badge: {
    backgroundColor: "#e74c3c",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
    minWidth: 20,
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  messageItem: {
    flexDirection: "row",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 50,
    borderWidth: 1,
    marginRight: 15,
  },
  messageContent: {
    flex: 1,
    justifyContent: "center",
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  senderName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2c3e50",
  },
  timestamp: {
    fontSize: 12,
    color: "#666",
  },
  messageText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#27ae60",
    marginTop: 4,
  },
  sendMessageContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingVertical: 20,
    paddingHorizontal: 15,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    marginVertical: 20,
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#27ae60",
    borderRadius: 20,
    padding: 12,
    marginLeft: 10,
  },
  requestItem: {
    flexDirection: "row",
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  requestContent: {
    flex: 1,
    justifyContent: "center",
  },
  requestName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 4,
  },
  requestTime: {
    fontSize: 12,
    color: "#666",
    marginBottom: 0,
  },
  requestActions: {
    flexDirection: "row",
    gap: 10,
  },
  acceptButton: {
    backgroundColor: "#27ae60",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  acceptButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  declineButton: {
    backgroundColor: "#e74c3c",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  declineButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  requestStatus: {
    marginTop: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#f39c12',
    fontWeight: 'bold',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    // backgroundColor: '#f8f9fa',
    marginVertical: 5,
    borderRadius: 12,
  },
  friendContent: {
    flex: 1,
    // marginLeft: 6,
  },
  friendName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 4,
  },
  friendLevel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  friendPoints: {
    fontSize: 14,
    color: '#f39c12',
  },
  messageButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#ecf0f1',
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#f8f9fa',
    marginVertical: 5,
    borderRadius: 12,
  },
  conversationContent: {
    flex: 1,
    margin: 12,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  conversationTime: {
    fontSize: 12,
    color: '#666',
  },
  conversationPreview: {
    fontSize: 14,
    color: '#666',
  },
  unreadBadge: {
    position: 'absolute',
    right: 0,
    // top: 0,
    bottom: 0,
    backgroundColor: '#e74c3c',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  messagesScrollView: {
    flex: 1,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f8f9fa',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  eventChatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // NEW
  requestTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },

  requestActionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },

  requestStatusPill: {
    backgroundColor: '#fef9e7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  requestStatusPillText: {
    color: '#f39c12',
    fontWeight: '700',
    fontSize: 12,
  },

});
