import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import Constants from 'expo-constants';

const CLOUD_URL = "https://material-app-zhm4.onrender.com"; 

const getBaseUrl = () => {  
  if (__DEV__) {
    if (Platform.OS === 'web') {
      return 'http://localhost:5005';
    }
    // Automatically use the LAN IP
    const debuggerHost = Constants?.manifest?.debuggerHost || Constants?.expoConfig?.hostUri;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      return `http://${ip}:5005`;
    }
    // Hardcoded IP as fallback
    return 'http://192.168.0.102:5005';
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
