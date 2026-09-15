import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseService } from '@/firebase/service';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/firebase/config';
import { doc, onSnapshot, getDocFromServer, collection, getDocs, updateDoc } from "firebase/firestore";


export type UserRole = 'user' | 'organizer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  bio: string;
  phone: string;
  points: number;
  pointsSpent: number;
  avatar?: string;
  friends: string[];
  createdAt: Date;
  updatedAt: Date;
  avatarKey?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, role: UserRole) => Promise<boolean>;
  register: (email: string, password: string, name: string, role: UserRole) => Promise<{success: boolean, errorCode?: string}>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setIsLoading(false);
    }
  };

//   const login = async (email: string, password: string, role: UserRole): Promise<boolean> => {
//     try {
//       // Use Firebase Auth for authentication
//       const userCredential = await signInWithEmailAndPassword(auth, email, password);
//       const userDoc = await FirebaseService.getUser(userCredential.user.uid);
      
//       if (userDoc && userDoc.role === role) {
//         await AsyncStorage.setItem('user', JSON.stringify(userDoc));
//         setUser(userDoc);
//         return true;
//       }
//       return false;
//     } catch (error) {
//       console.error('Login error:', error);
//       return false;
//     }
//   };

    // Replace the mock login function with:
    const login = async (email: string, password: string, role: UserRole): Promise<boolean> => {
        try {
            
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            const userDoc = await FirebaseService.getUser(userCredential.user.uid);
            
            if (userDoc) {
                
                // Check if the user's role matches the selected role
                if (userDoc.role === role) {
                    await AsyncStorage.setItem('user', JSON.stringify(userDoc));
                    setUser(userDoc);
                    //console.log('Login successful for role:', role);
                    return true;
                } else {
                    //console.log('Role mismatch. User role:', userDoc.role, 'Selected role:', role);
                    return false;
                }
            }
            return false;
        } catch (error: any) {
            // Handle specific Firebase auth errors gracefully
            if (error.code === 'auth/invalid-credential' || 
                error.code === 'auth/user-not-found' || 
                error.code === 'auth/wrong-password' ||
                error.code === 'auth/invalid-email') {
                // These are expected errors for wrong credentials - don't log as errors
                return false;
            } else {
                // Only log unexpected errors
                console.error('Unexpected login error:', error);
                return false;
            }
        }
    };
    
  const refreshUser = async () => {
    if (!user?.id) return;
    try {
      const snap = await getDocFromServer(doc(db, "users", user.id));
      if (snap.exists()) {
        const updated = { id: snap.id, ...snap.data() } as User;

        if (updated.pointsSpent === undefined) {
          await FirebaseService.updateUser(user.id, { pointsSpent: 0 });
          updated.pointsSpent = 0;
        }
        setUser(updated);
        await AsyncStorage.setItem("user", JSON.stringify(updated));
      }
    } catch (err) {
      console.error("Failed to refresh user:", err);
    }
  };

  const register = async (email: string, password: string, name: string, role: UserRole): Promise<{success: boolean, errorCode?: string}> => {
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid; // Auth UID
      
      // Create user document in Firestore using the Auth UID as document ID
      const newUser: User = {
        id: uid,
        email,
        name,
        role,
        points: 0,
        pointsSpent: 0,
        friends: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save user document to Firestore using FirebaseService
      await FirebaseService.createUser(newUser);
      
      // Store user data locally
      await AsyncStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);
      return { success: true };
    } catch (error: any) {
      // Handle specific Firebase auth errors gracefully
      if (error.code === 'auth/email-already-in-use' || 
          error.code === 'auth/invalid-email' ||
          error.code === 'auth/weak-password') {
        // These are expected errors for registration issues - don't log as errors
        return { success: false, errorCode: error.code };
      } else {
        // Only log unexpected errors
        console.error('Unexpected registration error:', error);
        return { success: false, errorCode: 'unknown' };
      }
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
      await AsyncStorage.removeItem('user');
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const updateUser = async (userData: Partial<User>) => {
    if (!user) return;
    
    try {
      await FirebaseService.updateUser(user.id, userData);
      const updatedUser = { ...user, ...userData };
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (error) {
      console.error('Update user error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      login,
      register,
      logout,
      updateUser,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
