import { Platform } from 'react-native';
import axios from 'axios';

// Use localhost in web browser, machine IP for Expo Go
const REMOTE_URL = (typeof window !== 'undefined' && window.location)
    ? 'http://localhost:5000/api/debug-log'
    : 'http://192.168.0.110:5000/api/debug-log';

const initRemoteLogging = () => {
    if (process.env.NODE_ENV !== 'development') return;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
        originalLog(...args);
        sendToRemote('log', args);
    };

    console.warn = (...args) => {
        // Filter out annoying React Native Web deprecation warnings from 3rd party libs
        if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('props.pointerEvents is deprecated')) {
            return;
        }
        originalWarn(...args);
        sendToRemote('warn', args);
    };

    console.error = (...args) => {
        originalError(...args);
        sendToRemote('error', args);
    };

    const sendToRemote = (level, args) => {
        try {
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');

            axios.post(REMOTE_URL, {
                level,
                message,
                args: [] // already joined into message for simplicity
            }).catch(() => {}); // ignore failures to send logs
        } catch (e) {
            // ignore
        }
    };

    console.log('🚀 Remote logging initialized - Web logs will now appear in backend terminal');
};

export default initRemoteLogging;
