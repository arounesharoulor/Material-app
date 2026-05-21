import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

// 1. PRODUCTION CLOUD URL (Fallback)
const CLOUD_URL = "https://material-app-zhm4.onrender.com"; 

const getBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return CLOUD_URL.endsWith('/') ? CLOUD_URL.slice(0, -1) : CLOUD_URL;
  }
  
  if (Platform.OS === 'web') {
      return 'http://localhost:5005';
  }
  
  try {
      // Magically extract the Expo development PC's IP address
      const scriptURL = NativeModules.SourceCode.scriptURL;
      const host = scriptURL.split('://')[1].split(':')[0];
      return `http://${host}:5005`;
  } catch (err) {
      return CLOUD_URL;
  }
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
