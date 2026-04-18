import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import Toast from 'react-native-toast-message';
import initRemoteLogging from './src/services/remoteLog';

initRemoteLogging();

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
      <Toast />
    </AuthProvider>
  );
}
