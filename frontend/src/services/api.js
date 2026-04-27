import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

// 1. SET YOUR CLOUD URL HERE after deploying the backend
// You can set this in Vercel as VITE_API_URL or EXPO_PUBLIC_API_URL
// If not set in ENV, fallback to the hardcoded Render URL (replace with your actual Render URL if needed)
const ENV_API_URL = process.env.VITE_API_URL || process.env.EXPO_PUBLIC_API_URL;
const CLOUD_URL = ENV_API_URL || ""; 

const getBaseUrl = () => {
  // 1. If CLOUD_URL is provided via Env Var or hardcoded, ALWAYS use it first (this fixes Vercel deployment)
  if (CLOUD_URL && CLOUD_URL.trim() !== '') {
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
  let machineIp = '192.168.0.110'; 
  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL) {
      console.log('[API] Detected scriptURL:', scriptURL);
      const match = scriptURL.match(/http:\/\/([\d\.]+):/);
      if (match && match[1]) {
         const detectedIp = match[1];
         if (detectedIp !== 'localhost' && detectedIp !== '127.0.0.1') {
           machineIp = detectedIp;
         }
      }
    }
  } catch (e) {
    console.error('[API] Error detecting IP:', e);
  }

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
