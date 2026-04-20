import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Detect if running on web browser → always use localhost for backend
// On mobile (Expo Go), use the machine's local network IP
const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    // On web, use the same host as the page (localhost OR the machine's IP)
    const hostname = window.location.hostname;
    return `http://${hostname}:5000`;
  }
  // Expo Go / native app — use machine's local network IP
  // Run 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux) to find your current IP
  return 'http://192.168.0.100:5000';
};

export const BASE_URL = getBaseUrl();
const SERVER_URL = `${BASE_URL}/api`;

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

export default api;
