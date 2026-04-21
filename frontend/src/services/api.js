import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

// 1. SET YOUR CLOUD URL HERE after deploying the backend (e.g., https://material-app-backend.onrender.com)
const CLOUD_URL = "https://material-app-zhm4.onrender.com"; 

const getBaseUrl = () => {
  // Use Cloud URL if provided
  if (CLOUD_URL) return CLOUD_URL;

  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        // If the web app is hosted on Vercel/Netlify, it should use the cloud URL
        return CLOUD_URL || `http://${hostname}:5000`;
    }
    return `http://localhost:5000`;
  }
  
  // On Mobile: Extract the IP address from the scriptURL (the IP of the dev machine)
  let machineIp = '192.168.0.109'; 
  
  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL) {
      const match = scriptURL.match(/http:\/\/([\d\.]+):/);
      if (match && match[1]) {
        const detectedIp = match[1];
        if (detectedIp !== 'localhost' && detectedIp !== '127.0.0.1') {
           machineIp = detectedIp;
        }
      }
    }
  } catch (e) {
    console.log('[API] IP detection failed');
  }

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
