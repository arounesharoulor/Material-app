import React, { useContext } from 'react';
import { View, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OtpScreen from '../screens/OtpScreen';

import DashboardScreen from '../screens/DashboardScreen';
import CreateRequestScreen from '../screens/CreateRequestScreen';
import StockScreen from '../screens/StockScreen';
import ReportScreen from '../screens/ReportScreen';
import AcceptedHistoryScreen from '../screens/AcceptedHistoryScreen';
import RejectedHistoryScreen from '../screens/RejectedHistoryScreen';
import PenaltyHistoryScreen from '../screens/PenaltyHistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RequestHistoryScreen from '../screens/RequestHistoryScreen';

const Stack = createStackNavigator();

const linking = {
  prefixes: [
    'https://materialappmanager.vercel.app',
    Platform.OS === 'web' ? (typeof window !== 'undefined' ? window.location.origin : '') : 'material-app://',
  ],
  config: {
    screens: {
      Login: 'login',
      Register: 'register',
      Otp: 'otp',
      Dashboard: 'dashboard',
      CreateRequest: 'create-request',
      Stock: 'stock',
      Reports: 'reports',
      AcceptedHistory: 'history/accepted',
      RejectedHistory: 'history/rejected',
      PenaltyHistory: 'history/penalty',
      Profile: 'profile',
      History: 'history',
    },
  },
};

const AppNavigator = () => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={({ navigation }) => ({ 
          headerShown: Platform.OS !== 'web',
          headerStyle: { backgroundColor: '#ffffff', elevation: 0, shadowOpacity: 0 },
          headerTitleStyle: { fontWeight: 'bold', color: '#1b264a' },
          headerLeft: () => {
               const state = navigation.getState();
               const route = state?.routes[state?.index];
               if (route?.name === 'Dashboard') return null;
               
               return (
                   <TouchableOpacity 
                      onPress={() => navigation.navigate('Dashboard')} 
                      style={{ marginLeft: 16 }}
                   >
                       <Ionicons name="arrow-back" size={26} color="#1b264a" />
                   </TouchableOpacity>
               );
          }
      })}>
        {user ? (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="CreateRequest" component={CreateRequestScreen} />
            <Stack.Screen name="Stock" component={StockScreen} />
            <Stack.Screen name="Reports" component={ReportScreen} />
            <Stack.Screen name="AcceptedHistory" component={AcceptedHistoryScreen} />
            <Stack.Screen name="RejectedHistory" component={RejectedHistoryScreen} />
            <Stack.Screen name="PenaltyHistory" component={PenaltyHistoryScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="History" component={RequestHistoryScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Otp" component={OtpScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
