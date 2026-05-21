import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

// 1. PRODUCTION CLOUD URL
const CLOUD_URL = "https://material-app-zhm4.onrender.com"; 

const getBaseUrl = () => {
  // 1. Check if we are in development mode
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV === 'development';

  // ALWAYS USE LOCAL FOR DEVELOPMENT TO ENSURE EMAIL WORKS
  if (isDev) {
      // Web Development
      if (Platform.OS === 'web') {
          return 'http://localhost:5005';
      }
      
      // Mobile Development (Automatic IP Detection)
      try {
        const scriptURL = NativeModules?.SourceCode?.scriptURL;
        if (scriptURL) {
          const match = scriptURL.match(/http:\/\/([\d\.]+):/);
          if (match && match[1]) {
             return `http://${match[1]}:5005`;
          }
        }
      } catch (e) {}

      // Manual fallback for mobile (update this to your computer's IP if needed)
      return `http://192.168.0.112:5005`;
  }

  // Use Cloud URL for production
  return CLOUD_URL.endsWith('/') ? CLOUD_URL.slice(0, -1) : CLOUD_URL;
};

export const BASE_URL = getBaseUrl();
export const SERVER_URL = `${BASE_URL}/api`;

const api = axios.create({
  baseURL: SERVER_URL
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers['x-auth-token'] = token;
  }
  config.headers['X-Tunnel-Skip-AntiPhishing-Page'] = 'true';
  return config;
});

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
