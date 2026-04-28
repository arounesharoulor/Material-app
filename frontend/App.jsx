import React from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import Toast from 'react-native-toast-message';
import initRemoteLogging from './src/services/remoteLog';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

initRemoteLogging();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AppNavigator />
        <Toast />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
