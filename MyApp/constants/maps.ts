import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Get the Google Maps API key based on the current platform
 * The API keys are configured in app.config.ts
 */
export const getGoogleMapsApiKey = (): string => {
  const config = Constants.expoConfig;
  
  if (Platform.OS === 'ios') {
    return (config?.ios as any)?.config?.googleMapsApiKey || '';
  } else if (Platform.OS === 'android') {
    return (config?.android as any)?.config?.googleMaps?.apiKey || '';
  }
  
  // Fallback for other platforms (shouldn't happen)
  return '';
};

export const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();

