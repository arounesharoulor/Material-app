import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Detect if running on web browser → always use localhost for backend
// On mobile (Expo Go), use the machine's local network IP
const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    // On web, use the same host as the page (so if accessing via IP, it uses IP)
    const hostname = window.location.hostname;
    // If we're on localhost, use 5000. If we're on IP, use same IP:5000
    return `http://${hostname}:5000`;
  }
  // Expo Go / native app — use local network IP
  return 'http://192.168.0.110:5000';
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
