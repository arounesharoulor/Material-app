import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Platform, StyleSheet, KeyboardAvoidingView, Keyboard, Animated, BackHandler, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tw from 'twrnc';
import api, { BASE_URL } from '../services/api';
import Sidebar from '../components/Sidebar';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import Toast from 'react-native-toast-message';

const StockScreen = ({ navigation }) => {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('');
  const { user, logout } = useContext(AuthContext);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const sidebarWidth = Platform.OS === 'web' ? Math.min(280, width * 0.85) : 280;
  const sidebarAnim = useRef(new Animated.Value(-sidebarWidth)).current;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  const toggleSidebar = () => {
    const toValue = isSidebarOpen ? -sidebarWidth : 0;
    Animated.spring(sidebarAnim, {
        toValue,
        useNativeDriver: true,
        bounciness: 0
    }).start();
    setIsSidebarOpen(!isSidebarOpen);
  };

  const socketRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
        if (Platform.OS === 'web') return;
        const onBackPress = () => {
            navigation.navigate('Dashboard');
            return true;
        };
        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [navigation])
  );

  useEffect(() => {
    fetchStock();

    socketRef.current = io(BASE_URL);
    socketRef.current.on('requestUpdated', () => {
        fetchStock();
    });
    socketRef.current.on('stockUpdated', () => {
        fetchStock();
    });

    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
      if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
      }
    };
  }, []);

  const fetchStock = async () => {
    try {
      const res = await api.get('/stock');
      setStock(res.data);
    } catch (err) {
      console.log('Error fetching stock');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = async () => {
    if (!newItemName || !newItemQty) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please fill all fields' });
      return;
    }
    try {
      await api.post('/stock', {
        materialName: newItemName.trim(),
        quantity: newItemQty
      });
      fetchStock();
      setNewItemName('');
      setNewItemQty('');
      Toast.show({ type: 'success', text1: 'Success', text2: 'Stock level updated' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update stock' });
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={{ flex: 1 }}
    >
    <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: isMobile ? 'column' : 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
      <Sidebar 
          user={user} 
          navigation={navigation} 
          logout={logout} 
          sidebarAnim={sidebarAnim} 
          toggleSidebar={toggleSidebar} 
          activeScreen="Stock" 
      />
      {isSidebarOpen && (Platform.OS !== 'web' || isMobile) && (
        <TouchableOpacity 
            activeOpacity={1} 
            onPress={toggleSidebar} 
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 90 }]} 
        />
      )}
      <View style={{ flex: 1, height: Platform.OS === 'web' ? '100vh' : 'auto' }}>
        <ScrollView 
          style={{ flex: 1, ...(Platform.OS === 'web' ? { height: '100vh', overflow: 'auto' } : {}) }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.paddingContainer}>
              {/* Header - Hidden on mobile when typing to save space */}
              {(!isKeyboardVisible || Platform.OS === 'web') && (
                <View style={styles.header}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {(Platform.OS !== 'web' || isMobile) && (
                            <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                                <Ionicons name="menu" size={24} color="#1b264a" />
                            </TouchableOpacity>
                        )}
                        <View>
                            <Text allowFontScaling={false} style={styles.headerLabel}>INVENTORY</Text>
                            <Text allowFontScaling={false} style={styles.headerTitle}>Stock Control</Text>
                        </View>
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={fetchStock} style={styles.syncBtn}>
                            <Text allowFontScaling={false} style={styles.headerBtnText}>SYNC</Text>
                        </TouchableOpacity>
                    </View>
                </View>
              )}
              
              <View style={styles.sectionCard}>
                  <Text allowFontScaling={false} style={styles.cardTitle}>Add or Update Material</Text>
                  
                  <View style={styles.presetGrid}>
                      {stock.map((item) => (
                          <TouchableOpacity 
                              key={item._id} 
                              style={[
                                  styles.chip,
                                  newItemName.toLowerCase() === item.materialName.toLowerCase() ? styles.chipActive : styles.chipInactive
                              ]}
                              onPress={() => {
                                  if (newItemName.toLowerCase() === item.materialName.toLowerCase()) {
                                      setNewItemName('');
                                  } else {
                                      setNewItemName(item.materialName);
                                  }
                              }}
                          >
                              <Text allowFontScaling={false} style={[
                                  styles.chipText,
                                  newItemName.toLowerCase() === item.materialName.toLowerCase() ? { color: '#ffffff' } : { color: '#475569' }
                              ]}>
                              {item.materialName}
                              </Text>
                          </TouchableOpacity>
                      ))}
                  </View>
  
                  <View style={styles.inputGroup}>
                      <Text allowFontScaling={false} style={styles.inputLabel}>MATERIAL NAME</Text>
                      <TextInput 
                          style={styles.input}
                          placeholder="e.g. Copper Wire" 
                          placeholderTextColor="#94a3b8"
                          value={newItemName}
                          onChangeText={setNewItemName}
                          nativeID="materialName"
                          name="materialName"
                      />
                  </View>
                  
                  <View style={styles.inputGroup}>
                      <Text allowFontScaling={false} style={styles.inputLabel}>QUANTITY TO ADD</Text>
                      <TextInput 
                          style={styles.inputBold}
                          placeholder="0" 
                          placeholderTextColor="#94a3b8"
                          keyboardType="numeric"
                          value={newItemQty}
                          onChangeText={setNewItemQty}
                          nativeID="totalQuantity"
                          name="totalQuantity"
                      />
                  </View>
  
                  <TouchableOpacity style={styles.updateBtn} onPress={handleAddStock} activeOpacity={0.8}>
                      <Text allowFontScaling={false} style={styles.updateBtnText}>UPDATE RECORD</Text>
                  </TouchableOpacity>
              </View>
  
              <View style={styles.listHeader}>
                  <Text allowFontScaling={false} style={styles.listHeaderTitle}>Current Stock</Text>
                  <View style={styles.countBadge}>
                      <Text allowFontScaling={false} style={styles.countBadgeText}>{stock.length} ITEMS</Text>
                  </View>
              </View>
              
              <View style={styles.gridContainer}>
                  {stock.map((item) => {
                      const isLow = item.quantity < 10;
                      return (
                          <View key={item._id} style={styles.stockGridCard}>
                              <View style={{ flex: 1, marginBottom: 12 }}>
                                  <Text allowFontScaling={false} numberOfLines={1} style={styles.stockGridName}>{item.materialName}</Text>
                                  {isLow ? (
                                      <View style={styles.criticalBadgeInner}>
                                          <Text allowFontScaling={false} style={styles.criticalBadgeText}>CRITICAL</Text>
                                      </View>
                                  ) : (
                                      <Text allowFontScaling={false} style={styles.stockMetaSmall}>In Warehouse</Text>
                                  )}
                              </View>
                              <View style={[styles.qtyBoxSmall, isLow ? styles.qtyBoxLow : styles.qtyBoxNormal]}>
                                  <Text allowFontScaling={false} style={[styles.qtyTextSmall, isLow ? { color: '#e11d48' } : { color: '#334155' }]}>
                                      {item.quantity}
                                  </Text>
                              </View>
                          </View>
                      );
                  })}
              </View>
  
              {stock.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text allowFontScaling={false} style={styles.emptyText}>No materials found in inventory</Text>
                </View>
              ) : null}
          </View>
        </ScrollView>
      </View>
    </View>
    </KeyboardAvoidingView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: Platform.OS === 'web' ? 0 : 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  paddingContainer: {
    padding: Platform.OS === 'web' ? 24 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 32 : 16,
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: Platform.OS === 'web' ? 28 : 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  syncBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  backBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  headerBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e293b',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 24,
    marginBottom: 32,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 10px rgba(0,0,0,0.05)' } : {}),
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 20,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  chipInactive: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: '#1e293b',
  },
  inputBold: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  updateBtn: {
    backgroundColor: '#1b264a',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    borderBottomWidth: 4,
    borderBottomColor: '#ffc61c',
    elevation: 4,
    shadowColor: '#1b264a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 8px rgba(27,38,74,0.2)' } : {}),
  },
  updateBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  listHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
  },
  countBadge: {
    backgroundColor: '#1b264a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  countBadgeText: {
    color: '#ffc61c',
    fontSize: 9,
    fontWeight: '800',
  },
  stockCard: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderLeftWidth: 4,
    borderLeftColor: '#ffc61c',
  },
  stockNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  stockName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    flexShrink: 1,
  },
  criticalBadge: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  criticalBadgeText: {
    color: '#e11d48',
    fontSize: 8,
    fontWeight: '900',
  },
  stockMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 6,
  },
  qtyBox: {
    width: 60,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  qtyBoxNormal: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  qtyBoxLow: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  qtyText: {
    fontSize: 20,
    fontWeight: '900',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  stockGridCard: {
    width: Platform.OS === 'web' ? (isMobile ? '48%' : '23%') : '48%', // 4 columns on web desktop, 2 on mobile
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderTopWidth: 4,
    borderTopColor: '#ffc61c',
    justifyContent: 'space-between',
  },
  stockGridName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  stockMetaSmall: {
    fontSize: 8,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  criticalBadgeInner: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  qtyBoxSmall: {
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    width: '100%',
  },
  qtyTextSmall: {
    fontSize: 16,
    fontWeight: '900',
  },
  emptyBox: {
    padding: 40,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    alignItems: 'center',
    width: '100%',
  },
  emptyText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    fontStyle: 'italic',
  }
});

export default StockScreen;

