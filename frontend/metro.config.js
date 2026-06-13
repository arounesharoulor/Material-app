const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Proxy implementation for Expo Web
if (config.server) {
  config.server.rewrite = (url) => {
    if (url.startsWith('/api')) {
       return url;
    }
    return url;
  };
}

module.exports = config;
