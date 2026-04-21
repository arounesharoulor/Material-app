import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const hostname = window.location.hostname;
    return `http://${hostname}:5000`;
  }
  
  // On Mobile: Extract the IP address from the scriptURL (the IP of the dev machine)
  let machineIp = '192.168.0.109'; // Fallback to current computer's LAN IP
  
  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL) {
      const match = scriptURL.match(/http:\/\/([\d\.]+):/);
      if (match && match[1]) {
        const detectedIp = match[1];
        // If detected IP is local, use our known LAN IP as better fallback
        if (detectedIp === 'localhost' || detectedIp === '127.0.0.1') {
           machineIp = '192.168.0.109';
        } else {
           machineIp = detectedIp;
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
