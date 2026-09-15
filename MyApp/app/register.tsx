import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import { db, auth } from "@/firebase/config";
import { doc, setDoc } from "firebase/firestore";
import { DEFAULT_AVATAR } from "@/constants/avatars";

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();

  // Input Validation
  const handleRegister = async () => {
    if (!email || !password || !name) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await register(email, password, name, role);
      if (result.success) {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await setDoc(doc(db, "users", uid), { avatarKey: DEFAULT_AVATAR }, { merge: true });
        }
        // Clear navigation stack and navigate to tabs
        router.dismissAll();
        router.replace('/(tabs)');
      } else {
        // Handle specific error codes
        switch (result.errorCode) {
          case 'auth/email-already-in-use':
            Alert.alert('Error', 'This email is already registered. Please use a different email or try logging in.');
            break;
          case 'auth/invalid-email':
            Alert.alert('Error', 'Please enter a valid email address.');
            break;
          case 'auth/weak-password':
            Alert.alert('Error', 'Password is too weak. Please choose a stronger password.');
            break;
          default:
            Alert.alert('Error', 'Registration failed. Please try again.');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Join Pickin' Trash</Text>
          <Text style={styles.subtitle}>
            {role === 'user' ? 'Start making a difference as a volunteer' : 'Create and manage events as an organizer'}
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.roleSelector}>
            {/* User Type Toggle */}
            <TouchableOpacity
              style={[styles.roleButton, role === 'user' && styles.roleButtonActive]}
              onPress={() => setRole('user')}
            >
              <IconSymbol name="person.fill" size={20} color={role === 'user' ? '#fff' : '#666'} />
              <Text style={[styles.roleText, role === 'user' && styles.roleTextActive]}>
                Volunteer
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, role === 'organizer' && styles.roleButtonActive]}
              onPress={() => setRole('organizer')}
            >
              <IconSymbol name="building.2.fill" size={20} color={role === 'organizer' ? '#fff' : '#666'} />
              <Text style={[styles.roleText, role === 'organizer' && styles.roleTextActive]}>
                Organizer
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <IconSymbol name={role === 'user' ? "person.fill" : "building.2.fill"} size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={role === 'user' ? "Full Name" : "Organization Name"}
              placeholderTextColor={"#888"}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <IconSymbol name="envelope.fill" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={"#888"}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <IconSymbol name="lock.fill" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={"#888"}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="none"
              autoComplete="off"
              autoCorrect={false}
              importantForAutofill="no"
              enablesReturnKeyAutomatically={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <IconSymbol name="lock.fill" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor={"#888"}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              textContentType="none"
              autoComplete="off"
              autoCorrect={false}
              importantForAutofill="no"
              enablesReturnKeyAutomatically={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text style={styles.registerButtonText}>
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.back()}
          >
            <Text style={styles.loginButtonText}>
              Already have an account? Sign In
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  roleSelector: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#f1f3f4',
    borderRadius: 12,
    padding: 4,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  roleButtonActive: {
    backgroundColor: '#27ae60',
  },
  roleText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  roleTextActive: {
    color: '#fff',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    justifyContent: 'flex-start',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    color: '#2c3e50',
    textAlign: 'left',
    letterSpacing: 0,
    fontWeight: 'normal',
  },
  registerButton: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  registerButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginButton: {
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#27ae60',
    fontSize: 16,
    fontWeight: '600',
  },
});
