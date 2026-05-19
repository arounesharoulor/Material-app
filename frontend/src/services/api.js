import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

// 1. PRODUCTION CLOUD URL
// This URL is used for the production Android APK build.
const CLOUD_URL = "https://material-app-zhm4.onrender.com"; 

const getBaseUrl = () => {
  // 1. Check if we are in development mode
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV === 'development';

  // SET TO false TO USE CLOUD, true TO USE YOUR COMPUTER IP
  const FORCE_LOCAL_IN_DEV = true; 

  // 2. USE CLOUD IF NOT FORCED TO LOCAL
  if ((!isDev || !FORCE_LOCAL_IN_DEV) && CLOUD_URL && CLOUD_URL.trim() !== '') {
      return CLOUD_URL.endsWith('/') ? CLOUD_URL.slice(0, -1) : CLOUD_URL;
  }

  // 2. Web Development Fallback
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const { hostname, protocol, host } = window.location;
    
    // Check if we are on localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://localhost:5005`;
    }

    // Handle VS Code / Gitpod / Codespaces style port forwarding
    if (host.includes('8081')) {
      const backendHost = host.replace('8081', '5005');
      return `${protocol}//${backendHost}`;
    }
  }

  // 3. Mobile Development Fallback (Extract IP)
  // MANUAL OVERRIDE: If your mobile cannot connect, update this IP to your computer's IP
  let machineIp = '192.168.0.112'; // Tried common alternative, but auto-detect is preferred

  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL) {
      const match = scriptURL.match(/http:\/\/([\d\.]+):/);
      if (match && match[1]) {
         const detectedIp = match[1];
         if (detectedIp !== 'localhost' && detectedIp !== '127.0.0.1') {
           return `http://${detectedIp}:5005`;
         }
      }
    }
  } catch (e) {
    console.warn('[API] IP detection failed, using fallback:', e.message);
  }

  // Final Fallback: If we can't detect, and it's not web, maybe try Cloud if the local fallback fails?
  // For now, let's just make the fallback easier to change.
  return `http://${machineIp}:5005`;
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
