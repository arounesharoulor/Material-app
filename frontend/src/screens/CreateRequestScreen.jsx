import React, { useState, useContext, useEffect } from 'react';
import { View, Text, TextInput, Image, Alert, ScrollView, TouchableOpacity, ActivityIndicator, Platform, StyleSheet, KeyboardAvoidingView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from 'twrnc';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import Toast from 'react-native-toast-message';
import Sidebar from '../components/Sidebar';
import { useRef, useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

const CreateRequestScreen = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const [materialName, setMaterialName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [photo, setPhoto] = useState(null);
  
  const [availableStock, setAvailableStock] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(-280)).current;

  const toggleSidebar = () => {
    const toValue = isSidebarOpen ? -280 : 0;
    Animated.timing(sidebarAnim, {
        toValue,
        duration: 300,
        useNativeDriver: true,
    }).start();
    setIsSidebarOpen(!isSidebarOpen);
  };

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
    fetchStockItems();
  }, []);

  const fetchStockItems = async () => {
    try {
      const res = await api.get('/stock');
      setAvailableStock(res.data);
    } catch (err) {
      console.log('Failed to fetch stock items');
    } finally {
      setLoadingItems(false);
    }
  };

  const pickImage = async () => {
    if (Platform.OS === 'web') {
        handleLaunchLibrary();
        return;
    }

    handleLaunchCamera();
  };

  const handleLaunchCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera access is required');
          return;
      }

      let result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          quality: 0.8,
      });

      if (!result.canceled) {
          setPhoto(result.assets[0]);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not launch camera');
    }
  };

  const handleLaunchLibrary = async () => {
    try {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaType.Images,
            allowsEditing: false,
            quality: 0.8,
        });

        if (!result.canceled) {
            setPhoto(result.assets[0]);
        }
    } catch (err) {
        Alert.alert('Error', 'Could not access gallery');
    }
  };

  const handleSubmit = async () => {
    if (!materialName || !quantity) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please select a material and enter quantity' });
      return;
    }

    Alert.alert(
      "Daily Deadline Reminder",
      "Notice: All materials must be submitted and returned before 6:00 PM today. Do you acknowledge this requirement and want to submit your request?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Confirm & Submit", 
          onPress: async () => {
              setIsSubmitting(true);
              try {
                const formData = new FormData();
                if (user) {
                  formData.append('employeeId', user.employeeId || 'EMP000');
                  formData.append('employeeName', user.name || 'Anonymous');
                  formData.append('employeeEmail', user.email || '');
                }
                
                formData.append('materialName', materialName);
                formData.append('quantity', quantity);

                if (photo) {
                  if (Platform.OS === 'web') {
                    const response = await fetch(photo.uri);
                    const blob = await response.blob();
                    formData.append('photo', blob, 'upload.jpg');
                  } else {
                    const localUri = photo.uri;
                    const filename = localUri.split('/').pop();
                    const match = /\.(\w+)$/.exec(filename);
                    const ext = match ? match[1].toLowerCase() : 'jpg';
                    const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                    formData.append('photo', { uri: localUri, name: filename, type });
                  }
                }

                const res = await api.post('/requests', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                    timeout: 30000, // 30 seconds
                });
                
                if (res.data.insufficientStock) {
                    Toast.show({ 
                        type: 'error', 
                        text1: 'Material Out of Stock', 
                        text2: 'Quantity exceeds available stock. Request sent to Admin for immediate restock.' 
                    });
                } else {
                    Toast.show({ type: 'success', text1: 'Success', text2: 'Request submitted successfully' });
                }
                
                navigation.navigate('Dashboard', { reload: Date.now() });
              } catch (err) {
                console.log('Upload Error:', err);
                const errorMsg = err.response?.data?.msg || err.message || 'Failed to submit request';
                Toast.show({ 
                    type: 'error', 
                    text1: 'Submission Error', 
                    text2: err.message === 'Network Error' ? 'Network Error: Cannot connect to server.' : errorMsg 
                });
              } finally {
                setIsSubmitting(false);
              }
          } 
        }
      ]
    );
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <View style={[tw`bg-slate-50`, Platform.OS === 'web' ? { flexDirection: 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
          <Sidebar 
              user={user} 
              navigation={navigation} 
              logout={() => {}} 
              sidebarAnim={sidebarAnim} 
              toggleSidebar={toggleSidebar} 
              activeScreen="CreateRequest" 
          />
          {isSidebarOpen && Platform.OS !== 'web' && (
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
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
              <View style={styles.paddingContainer}>
                  <View style={styles.header}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          {Platform.OS !== 'web' && (
                              <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                                  <Ionicons name="menu" size={24} color="#1b264a" />
                              </TouchableOpacity>
                          )}
                          <View>
                              <Text allowFontScaling={false} style={styles.headerLabel}>NEW ACTION</Text>
                              <Text allowFontScaling={false} style={styles.headerTitle}>Material Request</Text>
                          </View>
                      </View>
                      <View style={styles.headerActions}>
                          <View style={styles.liveIndicator}>
                              <View style={styles.liveDot} />
                              <Text allowFontScaling={false} style={styles.liveText}>LIVE</Text>
                          </View>
                      </View>
                  </View>
      
              <View style={styles.sectionCard}>
                  <Text allowFontScaling={false} style={styles.sectionLabel}>Material Selection</Text>
              {loadingItems ? (
                <ActivityIndicator size="small" color="#4f46e5" style={{ marginBottom: 16 }} />
              ) : (
                <View style={styles.presetGrid}>
                    {availableStock.map((item) => (
                        <TouchableOpacity 
                            key={item._id} 
                            style={[
                                styles.chip,
                                materialName === item.materialName ? styles.chipActive : styles.chipInactive
                            ]}
                            onPress={() => setMaterialName(item.materialName)}
                        >
                            <Text allowFontScaling={false} style={[
                                styles.chipText,
                                materialName === item.materialName ? { color: '#ffffff' } : { color: '#475569' }
                            ]}>
                                {item.materialName} ({item.quantity})
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
              )}
  
              <TextInput 
                  style={styles.readOnlyInput}
                  placeholder="Selected Material" 
                  value={materialName}
                  editable={false}
              />
  
              <TextInput 
                  style={styles.quantityInput}
                  placeholder="0" 
                  keyboardType="numeric"
                  value={quantity}
                  onChangeText={setQuantity}
              />
          </View>
  
          <View style={styles.sectionCard}>
              <Text allowFontScaling={false} style={styles.sectionLabel}>Reference Photo</Text>
              <TouchableOpacity 
                  style={styles.uploadBox}
                  onPress={pickImage}
              >
                  {photo ? (
                      <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="cover" />
                  ) : (
                      <View style={styles.uploadPlaceholder}>
                          <Ionicons name="camera" size={42} color="#94a3b8" />
                          <Text allowFontScaling={false} style={styles.uploadText}>Tap to upload or capture</Text>
                      </View>
                  )}
              </TouchableOpacity>
          </View>
  
          <TouchableOpacity 
              style={[
                  styles.submitBtn,
                  isSubmitting && { backgroundColor: '#c7d2fe' }
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
          >
              {isSubmitting ? (
                  <ActivityIndicator color="white" />
              ) : (
                  <Text allowFontScaling={false} style={styles.submitBtnText}>SUBMIT REQUEST</Text>
              )}
          </TouchableOpacity>
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  paddingContainer: {
    padding: Platform.OS === 'web' ? 24 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 32 : 14,
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
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  mobileMenuBtn: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    padding: Platform.OS === 'web' ? 24 : 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 20,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: '#1b264a',
    borderColor: '#1b264a',
  },
  chipInactive: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  readOnlyInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: '#64748b',
    marginBottom: 16,
  },
  quantityInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 20,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
  },
  uploadBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 20,
    minHeight: 180,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 180,
  },
  uploadPlaceholder: {
    alignItems: 'center',
  },
  uploadText: {
    color: '#94a3b8',
    fontWeight: '700',
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: '#1b264a',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 5,
    borderBottomColor: '#ffc61c',
    elevation: 8,
    shadowColor: '#1b264a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 12px rgba(27,38,74,0.3)' } : {}),
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  }
});

export default CreateRequestScreen;
