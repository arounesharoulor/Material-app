import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const hostname = window.location.hostname;
    return `http://${hostname}:5000`;
  }
  
  // On Mobile: Extract the IP address from the scriptURL (the IP of the dev machine)
  // This is the most reliable way to find the host machine in any network setup (Wi-Fi or Hotspot).
  let machineIp = '192.168.0.100'; // Fallback
  
  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL) {
      const match = scriptURL.match(/http:\/\/([\d\.]+):/);
      if (match && match[1]) {
        machineIp = match[ match[1] === 'localhost' || match[1] === '127.0.0.1' ? 0 : 1 ];
        // If it's localhost, we still need the real IP for the backend
        if (machineIp === 'localhost' || machineIp === '127.0.0.1') {
           machineIp = '192.168.0.100';
        } else {
           machineIp = match[1];
        }
      }
    }
  } catch (e) {
    console.log('[API] IP detection failed, using fallback');
  }

  console.log(`[API] Mobile detected, using BASE_URL: http://${machineIp}:5000`);
  return `http://${machineIp}:5000`;
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
  return config;
});

// Response interceptor: auto-clear stale tokens on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Silently remove invalid token — AuthContext will handle redirect
      await AsyncStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

export default api;
