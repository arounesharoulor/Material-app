import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import Constants from 'expo-constants';

// 1. PRODUCTION CLOUD URL (Fallback)
const CLOUD_URL = "https://material-app-zhm4.onrender.com"; 

const getBaseUrl = () => {  
  if (Platform.OS === 'web') {
      return 'http://localhost:5005';
  }
  
  if (__DEV__) {
      try {
          // Robustly get Expo's development LAN IP Address
          const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost || Constants.manifest2?.extra?.expoGo?.debuggerHost;
          if (hostUri) {
              const lanIp = hostUri.split(':')[0];
              return `http://${lanIp}:5005`;
          }
      } catch (err) {
          console.error("Failed to parse Expo LAN IP, falling back to Cloud");
      }
  }
  
  return CLOUD_URL;
};

export const BASE_URL = getBaseUrl();
console.log('Mobile/Web is connecting to backend at:', BASE_URL);
export const SERVER_URL = `${BASE_URL}/api`;

const api = axios.create({
  baseURL: SERVER_URL
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers['x-auth-token'] = token;
  }
  // Bypasses the Microsoft Dev Tunnels anti-phishing warning page
  config.headers['X-Tunnel-Skip-AntiPhishing-Page'] = 'true';
  return config;
});

// Response interceptor: log errors for debugging
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.log('[API] 401 Unauthorized detected');
    }
    return Promise.reject(error);
  }
);

export default api;
