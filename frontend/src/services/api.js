import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Cloud deployment URL (Render)
const CLOUD_URL = "https://material-app-zhm4.onrender.com";

/**
 * Determine the base URL for the backend.
 * We are currently pointing directly to the live Render backend.
 */
const getBaseUrl = () => {
  const envOverride =
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    process.env.REACT_APP_API_BASE_URL;

  if (envOverride) {
    return envOverride.replace(/\/+$/, '');
  }

  // Always use the cloud URL to connect to the live backend
  return CLOUD_URL;
};

export const BASE_URL = getBaseUrl();
console.log('Mobile/Web is connecting to backend at:', BASE_URL);
export const SERVER_URL = `${BASE_URL}/api`;

const api = axios.create({
  baseURL: SERVER_URL,
});

// Attach auth token to every request if present
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers['x-auth-token'] = token;
  }
  // Bypass Microsoft Dev Tunnels anti‑phishing warning page (if applicable)
  config.headers['X-Tunnel-Skip-AntiPhishing-Page'] = 'true';
  return config;
});

// Log 401 responses for debugging purposes
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
