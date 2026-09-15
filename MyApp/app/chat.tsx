import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { FirebaseService } from "@/firebase/service";
import { MessageDocument, UserDocument } from "@/firebase/schema";
import { AVATARS, DEFAULT_AVATAR } from "@/constants/avatars";

export default function Chat() {
  const { userId, eventId } = useLocalSearchParams<{ userId?: string, eventId?: string }>();
  const { user } = useAuth();
  const [otherUser, setOtherUser] = useState<UserDocument | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [messages, setMessages] = useState<MessageDocument[]>([]);
  const [userNames, setUserNames] = useState<{[userId: string]: string}>({});
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isEventChat, setIsEventChat] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const otherAvatarKey =
  otherUser?.avatarKey && AVATARS[otherUser.avatarKey]
    ? (otherUser.avatarKey as keyof typeof AVATARS)
    : DEFAULT_AVATAR;


  useEffect(() => {
    if ((userId || eventId) && user) {
      loadChatData();
    }
  }, [userId, eventId, user]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollViewRef.current && messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const loadChatData = async () => {
    if ((!userId && !eventId) || !user) return;

    try {
      setLoading(true);
      
      if (eventId) {
        // Event chat
        setIsEventChat(true);
        
        // Load event data
        const eventData = await FirebaseService.getEvent(eventId);
        if (!eventData) {
          Alert.alert("Error", "Event not found");
          router.back();
          return;
        }
        setEvent(eventData);

        // Check if user is part of this event
        if (!eventData.volunteers.includes(user.id) && eventData.organizerId !== user.id) {
          Alert.alert("Error", "You must join this event to access its chat");
          router.back();
          return;
        }

        // Load event messages
        const messagesData = await FirebaseService.getEventMessages(eventId);
        setMessages(messagesData);

        // Load user names for event chat
        await loadUserNames(messagesData, true);

        // Mark event messages as read
        await FirebaseService.markEventMessagesAsRead(user.id, eventId);

      } else if (userId) {
        // Private chat
        setIsEventChat(false);
        
        // Load other user's data
        const otherUserData = await FirebaseService.getUser(userId);
        if (!otherUserData) {
          Alert.alert("Error", "User not found");
          router.back();
          return;
        }
        setOtherUser(otherUserData);

        // Load messages between users
        const messagesData = await FirebaseService.getMessagesBetweenUsers(user.id, userId);
        setMessages(messagesData);

        // Mark messages as read
        await FirebaseService.markMessagesAsRead(userId, user.id);
      }

    } catch (error) {
      console.error("Error loading chat data:", error);
      Alert.alert("Error", "Failed to load chat");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user || sending) return;

    try {
      setSending(true);
      let success = false;
      
      if (isEventChat && eventId) {
        // Send event message
        success = await FirebaseService.sendEventMessage(user.id, eventId, newMessage.trim());
        if (success) {
          // Reload event messages
          const updatedMessages = await FirebaseService.getEventMessages(eventId);
          setMessages(updatedMessages);
          // Reload user names for new senders
          await loadUserNames(updatedMessages, true);
        }
      } else if (userId) {
        // Send private message
        success = await FirebaseService.sendMessage(user.id, userId, newMessage.trim());
        if (success) {
          // Reload private messages
          const updatedMessages = await FirebaseService.getMessagesBetweenUsers(user.id, userId);
          setMessages(updatedMessages);
        }
      }
      
      if (success) {
        setNewMessage('');
      } else {
        Alert.alert("Error", "Failed to send message");
      }
    } catch (error) {
      console.error("Send message error:", error);
      Alert.alert("Error", "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp: Date) => {
    const now = new Date();
    const messageTime = new Date(timestamp);
    const diffInHours = (now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return messageTime.toLocaleDateString();
    }
  };

  const formatDate = (timestamp: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const messageDate = new Date(timestamp);
    
    // Check if it's today
    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    }
    
    // Check if it's yesterday
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // For other dates, show the actual date
    return messageDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const renderMessagesWithDateSeparators = () => {
    if (messages.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>Start a conversation!</Text>
        </View>
      );
    }

    const renderedMessages: React.ReactNode[] = [];
    let lastDate: string | null = null;

    messages.forEach((message, index) => {
      const messageDate = formatDate(message.timestamp);
      
      // Add date separator if this is a new day
      if (messageDate !== lastDate) {
        renderedMessages.push(
          <View key={`date-${message.id}`} style={styles.dateSeparatorContainer}>
            <Text style={styles.dateSeparatorText}>{messageDate}</Text>
          </View>
        );
        lastDate = messageDate;
      }
      
      // Add the message
      renderedMessages.push(renderMessage(message));
    });

    return renderedMessages;
  };

  const loadUserNames = async (messages: MessageDocument[], isEventChatMode: boolean = isEventChat) => {
    if (!isEventChatMode) return;
    
    const uniqueUserIds = new Set<string>();
    messages.forEach(message => {
      if (message.senderId !== 'system' && message.senderId !== user?.id) {
        uniqueUserIds.add(message.senderId);
      }
    });

    const namePromises = Array.from(uniqueUserIds).map(async (userId) => {
      const userData = await FirebaseService.getUser(userId);
      return { userId, name: userData?.name || 'Unknown User' };
    });

    const userNamesData = await Promise.all(namePromises);
    const namesMap: {[userId: string]: string} = {};
    userNamesData.forEach(({ userId, name }) => {
      namesMap[userId] = name;
    });

    setUserNames(namesMap);
  };

  const renderMessage = (message: MessageDocument) => {
    const isFromCurrentUser = message.senderId === user?.id;
    const isSystemMessage = message.senderId === 'system';
    
    // System messages are displayed differently
    if (isSystemMessage) {
      return (
        <View key={message.id} style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{message.content}</Text>
        </View>
      );
    }
    
    // Regular user messages
    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isFromCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft
        ]}
      >
        {/* Show sender name for event chats */}
        {isEventChat && !isFromCurrentUser && (
          <Text style={styles.senderName}>
            {userNames[message.senderId] || 'Loading...'}
          </Text>
        )}
        
        <View
          style={[
            styles.messageBubble,
            isFromCurrentUser ? styles.messageBubbleRight : styles.messageBubbleLeft
          ]}
        >
          <Text style={[
            styles.messageText,
            isFromCurrentUser ? styles.messageTextRight : styles.messageTextLeft
          ]}>
            {message.content}
          </Text>
          <Text style={[
            styles.messageTime,
            isFromCurrentUser ? styles.messageTimeRight : styles.messageTimeLeft
          ]}>
            {formatTime(message.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Loading...</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading chat...</Text>
        </View>
      </View>
    );
  }

  if (!otherUser && !event) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Chat</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chat not found</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      // Fix for awkward iOS spacing between keyboard and text input
      keyboardVerticalOffset={Platform.OS === 'ios' ? -20 : 0} 
    >
      {/* Top Bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.topBarUser}>
          {isEventChat ? (
            <View style={styles.eventChatIcon}>
              <IconSymbol name="calendar" size={20} color="#fff" />
            </View>
          ) : (
            <Image
              source={AVATARS[otherAvatarKey]}
              style={styles.topBarAvatar}
            />
          )}
          <View style={styles.topBarUserInfo}>
            <Text style={styles.topBarUserName}>
              {isEventChat ? event?.name : otherUser?.name}
            </Text>
            <Text style={styles.topBarUserStatus}>
              {isEventChat ? 'Event Chat' : 'Online'}
            </Text>
          </View>
        </View>
        <View style={{ width: 24 }} />
      </SafeAreaView>

      {/* Messages */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {renderMessagesWithDateSeparators()}
      </ScrollView>

      {/* Message Input */}
      <SafeAreaView edges={['bottom']} style={styles.inputContainer}>
      {/* <View style={styles.inputContainer}> */}
        <TextInput
          style={styles.messageInput}
          placeholder="Type a message..."
          placeholderTextColor={'#aaa'}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || sending) && styles.sendButtonDisabled
          ]}
          onPress={handleSendMessage}
          disabled={!newMessage.trim() || sending}
        >
          <IconSymbol 
            name="paperplane.fill" 
            size={20} 
            color={(!newMessage.trim() || sending) ? "#ccc" : "#fff"} 
          />
        </TouchableOpacity>
      {/* </View> */}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

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
    backgroundColor: "#333",
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  topBarUser: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: 15,
  },
  topBarAvatar: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    marginRight: 10,
  },
  topBarUserInfo: {
    flex: 1,
  },
  topBarUserName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  topBarUserStatus: {
    fontSize: 12,
    color: "#27ae60",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  messagesContent: {
    padding: 15,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 18,
    color: "#666",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
  },
  messageContainer: {
    marginVertical: 4,
  },
  messageContainerLeft: {
    alignItems: "flex-start",
  },
  messageContainerRight: {
    alignItems: "flex-end",
  },
  messageBubble: {
    maxWidth: "80%",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
  },
  messageBubbleLeft: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 5,
  },
  messageBubbleRight: {
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 5,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  messageTextLeft: {
    color: "#333",
  },
  messageTextRight: {
    color: "#fff",
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  messageTimeLeft: {
    color: "#666",
  },
  messageTimeRight: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 15,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: "#007AFF",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#e0e0e0",
  },
  eventChatIcon: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 20,
  },
  systemMessageText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  dateSeparatorContainer: {
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 20,
  },
  dateSeparatorText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    textAlign: 'center',
  },
  senderName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    marginLeft: 5,
  },
});
