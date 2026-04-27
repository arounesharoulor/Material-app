import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

// 1. SET YOUR CLOUD URL HERE after deploying the backend (e.g., https://material-app-backend.onrender.com)
// const CLOUD_URL = "https://material-app-zhm4.onrender.com";
const CLOUD_URL = ""; 

const getBaseUrl = () => {
  // Use Cloud URL if provided
  if (CLOUD_URL) return CLOUD_URL;

  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const { hostname, protocol, host } = window.location;
    
    // Check if we are on localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://localhost:5005`;
    }

    // Handle VS Code / Gitpod / Codespaces style port forwarding
    // These typically look like: 8081-xyz.github.dev or xyz-8081.preview.app.github.dev
    if (host.includes('8081')) {
      const backendHost = host.replace('8081', '5005');
      return `${protocol}//${backendHost}`;
    }

    // If we are on an IP or a public URL, use the same hostname but port 5005
    return `${protocol}//${hostname}:5005`;
  }

  // On Mobile: Extract the IP address from the scriptURL (the IP of the dev machine)
  // Fallback updated to the detected IP from logs
  let machineIp = '192.168.0.110'; 
  
  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL) {
      console.log('[API] Detected scriptURL:', scriptURL);
      const match = scriptURL.match(/http:\/\/([\d\.]+):/);
      if (match && match[1]) {
         const detectedIp = match[1];
         if (detectedIp !== 'localhost' && detectedIp !== '127.0.0.1') {
           console.log('[API] Detected IP from scriptURL:', detectedIp);
           machineIp = detectedIp;
         }
      }
    } else {
      console.log('[API] NativeModules.SourceCode.scriptURL is null, using fallback:', machineIp);
    }
  } catch (e) {
    console.error('[API] Error detecting IP:', e);
  }

  const finalUrl = `http://${machineIp}:5005`;
  console.log('[API] Final Backend URL:', finalUrl);
  return finalUrl;
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
