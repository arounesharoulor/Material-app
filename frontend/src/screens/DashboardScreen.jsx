import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, Animated, Modal, TextInput, StyleSheet, Dimensions, KeyboardAvoidingView, ActivityIndicator, Image, Alert, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tw from 'twrnc';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import api, { BASE_URL } from '../services/api';
import Sidebar from '../components/Sidebar';

const REJECTION_REASONS = [
    "Insufficient stock in warehouse",
    "Invalid employee ID combination",
    "Duplicate request detected",
    "Items temporarily unavailable",
    "Unauthorized material type",
    "Other (Type below)"
];

const FEEDBACK_REASONS = [
    "Clarification needed on quantity",
    "Photo reference is unclear",
    "Material arrives next week",
    "Wait for manager approval",
    "Verify project site location",
    "Other (Type below)"
];

const POLL_INTERVAL_MS = 10000; // 10 seconds

const DashboardScreen = ({ navigation, route }) => {
  const { user, logout } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingPhoto, setIsSubmittingPhoto] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('REJECT'); 
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(-280)).current;
  const socketRef = useRef(null);
  const isFocusedRef = useRef(true);

  // Image Viewer State
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [viewerTitle, setViewerTitle] = useState('');

  const toggleSidebar = () => {
    const toValue = isSidebarOpen ? -280 : 0;
    Animated.timing(sidebarAnim, {
        toValue,
        duration: 300,
        useNativeDriver: true,
    }).start();
    setIsSidebarOpen(!isSidebarOpen);
  };

  const setupSocket = useCallback(() => {
    if (socketRef.current) return;
    
    socketRef.current = io(BASE_URL);
    
    socketRef.current.on('connect', () => {
        setIsLive(true);
    });
    
    socketRef.current.on('requestUpdated', () => {
        if (isFocusedRef.current) {
            fetchRequests(true);
            if (user?.role === 'Employee') {
                Toast.show({
                    type: 'success',
                    text1: '🔔 Dashboard Updated',
                    text2: 'One of your requests has been updated by the admin.',
                    visibilityTime: 4000,
                });
            }
        }
    });

    socketRef.current.on('disconnect', () => {
        setIsLive(false);
    });
  }, [user]);

  useFocusEffect(
    useCallback(() => {
        if (Platform.OS === 'web') return;
        const onBackPress = () => {
             Alert.alert(
                "Exit App",
                "Are you sure you want to close the application?",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Exit", onPress: () => BackHandler.exitApp() }
                ]
            );
            return true;
        };
        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [])
  );

  useEffect(() => {
    fetchRequests();
    setupSocket();

    const unsubFocus = navigation.addListener('focus', () => {
      isFocusedRef.current = true;
      fetchRequests();
    });
    const unsubBlur = navigation.addListener('blur', () => {
      isFocusedRef.current = false;
    });

    return () => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
    };
  }, []);

  const [allRequests, setAllRequests] = useState([]);

  const fetchRequests = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const res = await api.get('/requests');
      setAllRequests(res.data);
      
      // Define active items (not Closed, Rejected, or Penalized)
      const activeRequests = res.data.filter(r => !['Closed', 'Rejected', 'Penalized'].includes(r.status));
      
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Filter for active items THAT ARE FROM TODAY
      // Older items (even if active) stay in History as per user's previous request
      const activeToday = activeRequests.filter(r => new Date(r.date) >= startOfToday);
      
      if (user?.role === 'Employee' && user?.employeeId) {
          // Employees see ALL their active requests from TODAY on the dashboard
          // Older active requests are in the "History" sections
          const empActive = activeToday.filter(r => r.employeeId === user.employeeId).sort((a,b) => new Date(b.date) - new Date(a.date));
          setRequests(empActive);
      } else {
          // Admins see ALL active items from TODAY
          // Older items are segregated in Request History
          setRequests(activeToday.sort((a,b) => new Date(b.date) - new Date(a.date)));
      }
    } catch (err) {
      console.log('Error fetching requests');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (id, status, reason = '', comment = '') => {
    if (user?.role !== 'Admin') return;

    try {
        const res = await api.put(`/requests/${id}`, { 
            status, 
            rejectionReason: reason,
            adminComment: comment 
        });
        
        await fetchRequests(); 

        if (res.data.lowStockWarning) {
            Toast.show({
                type: 'error',
                text1: 'Restock Required!',
                text2: res.data.lowStockWarning,
                visibilityTime: 6000,
            });
        } else {
            Toast.show({
                type: 'success',
                text1: 'Response Recorded',
                text2: status === 'Pending' ? 'Comment sent to employee' : `Request ${status}`
            });
        }
        
        setIsModalOpen(false);
        setCommentText('');
        setSelectedPreset('');
    } catch (error) {
        Toast.show({
            type: 'error',
            text1: 'Update Failed',
            text2: error.response?.data?.msg || 'Could not save response'
        });
    }
  };

  const processUpload = async (id, uri, endpoint) => {
    setIsSubmittingPhoto(true);
    try {
        const formData = new FormData();
        
        if (Platform.OS === 'web') {
            const response = await fetch(uri);
            const blob = await response.blob();
            formData.append('photo', blob, 'upload.jpg');
        } else {
            const filename = uri.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const ext = match ? match[1].toLowerCase() : 'jpg';
            const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
            formData.append('photo', { uri, name: filename, type });
        }

        await api.put(`/requests/${id}/${endpoint}`, formData);
        
        Toast.show({ 
            type: 'success', 
            text1: endpoint === 'pickup' ? 'Pickup Recorded' : 'Return Recorded', 
            text2: 'Status updated successfully' 
        });
        fetchRequests();
    } catch (err) {
        console.error('Upload Error:', err);
        const errorMsg = err.response?.data?.msg || err.message || 'Could not upload photo';
        Toast.show({ 
            type: 'error', 
            text1: 'Upload Failed', 
            text2: err.message === 'Network Error' ? 'Network Error: Backend unreachable.' : errorMsg 
        });
    } finally {
        setIsSubmittingPhoto(false);
    }
  };

  const handlePhotoAction = async (id, endpoint) => {
    if (Platform.OS === 'web') {
        // Web usually just uses library which opens file dialog
        handleLaunchLibrary(id, endpoint);
        return;
    }

    handleLaunchCamera(id, endpoint);
  };

  const handleLaunchCamera = async (id, endpoint) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
          Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Camera access is required' });
          return;
      }

      let result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          quality: 0.8,
      });

      if (!result.canceled) {
          await processUpload(id, result.assets[0].uri, endpoint);
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not launch camera' });
    }
  };

  const handleLaunchLibrary = async (id, endpoint) => {
    try {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.8,
        });

        if (!result.canceled) {
            await processUpload(id, result.assets[0].uri, endpoint);
        }
    } catch (err) {
        Toast.show({ type: 'error', text1: 'Selection Error', text2: 'Could not access gallery' });
    }
  };

  const handlePickupPhoto = async (id) => {
    handlePhotoAction(id, 'pickup');
  };

  const handleReturnPhoto = async (id) => {
    Alert.alert(
        "Submission Deadline",
        "Reminder: All materials must be submitted and returned before 6:00 PM today to avoid penalties. Do you want to proceed with submission?",
        [
            { text: "Cancel", style: "cancel" },
            { text: "Proceed", onPress: () => handlePhotoAction(id, 'return') }
        ]
    );
  };

  const handleIssuePenalty = async (id, penalty) => {
    try {
        await api.put(`/requests/${id}/penalty`, { penalty });
        Toast.show({ type: 'success', text1: 'Penalty Issued', text2: 'Employee has been penalized' });
        setIsModalOpen(false);
        fetchRequests();
    } catch (err) {
        Toast.show({ type: 'error', text1: 'Failed', text2: 'Could not issue penalty' });
    }
  };

  const getFullImageUrl = (path) => {
    if (!path) return null;
    const cleanPath = path.toString().trim().replace(/\\/g, '/');
    const finalPath = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
    return `${BASE_URL}/${finalPath}`;
  };

  const openViewer = (path, title) => {
    const url = getFullImageUrl(path);
    if (!url) return;
    setViewerImage(url);
    setViewerTitle(title);
    setViewerVisible(true);
  };

  const AnimatedCard = ({ item }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { 
              toValue: 1, 
              duration: 500, 
              useNativeDriver: Platform.OS === 'web' ? false : true 
            }),
            Animated.timing(translateY, { 
              toValue: 0, 
              duration: 500, 
              useNativeDriver: Platform.OS === 'web' ? false : true 
            })
        ]).start();

        if (item.adminComment && item.status === 'Pending') {
            pulseAnim.setValue(1); 
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { 
                      toValue: 1.05, 
                      duration: 1000, 
                      useNativeDriver: Platform.OS === 'web' ? false : true 
                    }),
                    Animated.timing(pulseAnim, { 
                      toValue: 1, 
                      duration: 1000, 
                      useNativeDriver: Platform.OS === 'web' ? false : true 
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [item.adminComment, item.status]);

    const isOverdue = item.dueDate && new Date(item.dueDate) < new Date() && item.status === 'PendingReturn';
    const hasAnyPhoto = !!(item.photoUrl || item.pickupPhotoUrl || item.returnPhotoUrl);

    return (
        <Animated.View style={[
            styles.card,
            { opacity: fadeAnim, transform: [{ translateY }] }
        ]}>
            <View style={styles.cardAccent} />
            <View style={styles.cardYellowStrip} />
            <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={styles.cardTitle}>{item.materialName}</Text>
                    <Text allowFontScaling={false} style={styles.cardSubtitle}>ID: {item.requestId}</Text>
                    {item.dueDate ? (
                        <Text allowFontScaling={false} style={[styles.dueDate, isOverdue ? styles.overdueText : {}]}>
                            Due: {new Date(item.dueDate).toLocaleDateString()}
                        </Text>
                    ) : null}
                </View>
                <View style={[
                    styles.statusBadge,
                    item.status === 'Approved' || item.status === 'Closed' ? styles.badgeEmerald : 
                    item.status === 'Rejected' || item.status === 'Penalized' ? styles.badgeRose : 
                    item.status === 'PendingReturn' ? styles.badgeIndigo : styles.badgeAmber
                ]}>
                    <Text allowFontScaling={false} style={[
                        styles.badgeText,
                        item.status === 'Approved' || item.status === 'Closed' ? styles.textEmerald : 
                        item.status === 'Rejected' || item.status === 'Penalized' ? styles.textRose : 
                        item.status === 'PendingReturn' ? styles.textIndigo : styles.textAmber
                    ]}>{item.status.toUpperCase().replace('PENDINGRETURN', 'PICKED UP')}</Text>
                </View>
            </View>

            {isOverdue ? (
                <View style={styles.penaltyBadge}>
                    <Text allowFontScaling={false} style={styles.penaltyBadgeText}>⚠️ OVERDUE - RETURN IMMEDIATELY</Text>
                </View>
            ) : null}

            {item.insufficientStock && item.status === 'Pending' ? (
                <View style={user?.role === 'Admin' ? styles.urgentBadge : styles.waitingBadge}>
                    <Text allowFontScaling={false} style={user?.role === 'Admin' ? styles.urgentBadgeText : styles.waitingBadgeText}>
                        {user?.role === 'Admin' ? '⚠️ INSUFFICIENT STOCK - RESTOCK IMMEDIATELY' : '⏳ WAITING FOR WAREHOUSE RESTOCK'}
                    </Text>
                </View>
            ) : null}

            <View style={styles.cardDetails}>
                <View style={styles.detailRow}>
                    <Text allowFontScaling={false} style={styles.detailLabel}>REQUESTED BY</Text>
                    <View>
                        <Text allowFontScaling={false} style={styles.detailValue}>{item.employeeName} ({item.employeeId})</Text>
                        {item.employeeEmail ? <Text allowFontScaling={false} style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{item.employeeEmail}</Text> : null}
                    </View>
                </View>
                <View style={styles.detailRow}>
                    <Text allowFontScaling={false} style={styles.detailLabel}>QUANTITY</Text>
                    <Text allowFontScaling={false} style={styles.detailValueIndigo}>{item.quantity} Units</Text>
                </View>
            </View>

            {/* Photo Section */}
            <View style={styles.photoSectionHeader}>
                <Text style={styles.photoSectionTitle}>ATTACHMENTS</Text>
                {!hasAnyPhoto ? <Text style={styles.noPhotoText}>No evidence uploaded yet</Text> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoContainer}>
                {item.photoUrl ? (
                    <TouchableOpacity style={styles.photoBox} onPress={() => openViewer(item.photoUrl, 'Reference Photo')}>
                        <Text style={styles.photoLabel}>Ref Photo</Text>
                        <Image source={{ uri: getFullImageUrl(item.photoUrl) }} style={styles.cardImage} />
                    </TouchableOpacity>
                ) : null}
                {item.pickupPhotoUrl ? (
                    <TouchableOpacity style={styles.photoBox} onPress={() => openViewer(item.pickupPhotoUrl, 'Pickup Proof')}>
                        <Text style={styles.photoLabel}>Pickup Proof</Text>
                        <Image source={{ uri: getFullImageUrl(item.pickupPhotoUrl) }} style={styles.cardImage} />
                    </TouchableOpacity>
                ) : null}
                {item.returnPhotoUrl ? (
                    <TouchableOpacity style={styles.photoBox} onPress={() => openViewer(item.returnPhotoUrl, 'Return Proof')}>
                        <Text style={styles.photoLabel}>Return Proof</Text>
                        <Image source={{ uri: getFullImageUrl(item.returnPhotoUrl) }} style={styles.cardImage} />
                    </TouchableOpacity>
                ) : null}
            </ScrollView>

            {item.adminComment && (
                <Animated.View style={[
                    styles.noteBox,
                    { transform: [{ scale: pulseAnim }] }
                ]}>
                    <View style={styles.noteHeader}>
                        <Text allowFontScaling={false} style={styles.noteLabel}>
                            {item.status === 'Pending' ? '⚠️ ACTION REQUIRED' : 'ℹ️ ADMIN NOTE'}
                        </Text>
                        <View style={styles.dot} />
                    </View>
                    <Text allowFontScaling={false} style={styles.noteText}>{item.adminComment}</Text>
                </Animated.View>
            )}

            {item.penalty ? (
                <View style={styles.penaltyBox}>
                    <Text allowFontScaling={false} style={styles.penaltyLabel}>PENALTY ISSUED</Text>
                    <Text allowFontScaling={false} style={styles.penaltyText}>{item.penalty}</Text>
                </View>
            ) : null}

            {item.status === 'Rejected' && item.rejectionReason ? (
                <View style={styles.rejectBox}>
                    <Text allowFontScaling={false} style={styles.rejectLabel}>REJECTION REASON</Text>
                    <Text allowFontScaling={false} style={styles.rejectText}>{item.rejectionReason}</Text>
                </View>
            ) : null}

            <View style={styles.cardFooter}>
                <Text allowFontScaling={false} style={styles.footerTime}>{new Date(item.inTime).toLocaleTimeString()}</Text>
                <Text allowFontScaling={false} style={styles.footerDate}>{new Date(item.inTime).toLocaleDateString()}</Text>
            </View>
            
            {/* Actions for Admin */}
            {user?.role === 'Admin' ? (
                <View style={styles.actionRow}>
                    {item.status === 'Pending' ? (
                        <>
                            <TouchableOpacity style={[styles.actionBtn, styles.btnEmerald]} onPress={() => handleUpdateStatus(item._id, 'Approved')}>
                                <Text allowFontScaling={false} style={styles.btnText}>APPROVE</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.actionBtn, styles.btnAmber]} 
                                onPress={() => { setSelectedRequestId(item._id); setModalMode('PENDING_REASON'); setIsModalOpen(true); }}
                            >
                                <Text allowFontScaling={false} style={styles.btnText}>FEEDBACK</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.actionBtn, styles.btnRose]} 
                                onPress={() => { setSelectedRequestId(item._id); setModalMode('REJECT'); setIsModalOpen(true); }}
                            >
                                <Text allowFontScaling={false} style={styles.btnText}>REJECT</Text>
                            </TouchableOpacity>
                        </>
                    ) : null}
                    {item.status === 'PendingReturn' ? (
                        <TouchableOpacity 
                            style={[styles.actionBtn, styles.btnRose]} 
                            onPress={() => { setSelectedRequestId(item._id); setModalMode('PENALTY'); setIsModalOpen(true); }}
                        >
                            <Text allowFontScaling={false} style={styles.btnText}>ISSUE PENALTY</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            ) : null}

            {/* Actions for Employee */}
            {user?.role === 'Employee' ? (
                <View style={styles.actionRow}>
                    {item.status === 'Approved' ? (
                        <TouchableOpacity style={[styles.actionBtn, styles.btnIndigo]} onPress={() => handlePickupPhoto(item._id)}>
                            <Text allowFontScaling={false} style={styles.btnText}>UPLOAD PICKUP PHOTO</Text>
                        </TouchableOpacity>
                    ) : null}
                    {item.status === 'PendingReturn' ? (
                        <TouchableOpacity style={[styles.actionBtn, styles.btnGreen]} onPress={() => handleReturnPhoto(item._id)}>
                            <Text allowFontScaling={false} style={styles.btnText}>SUBMIT RETURN PHOTO</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            ) : null}
        </Animated.View>
    );
  };


  if (isLoading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#1b264a" />
      <Text style={styles.loadingText}>Loading Portal...</Text>
    </View>
  );

  const reasons = modalMode === 'REJECT' ? REJECTION_REASONS : modalMode === 'PENALTY' ? ["Late Return", "Damaged Material", "Missing Item"] : FEEDBACK_REASONS;

  return (
    <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
      <Sidebar 
          user={user} 
          navigation={navigation} 
          logout={logout} 
          sidebarAnim={sidebarAnim} 
          toggleSidebar={toggleSidebar} 
          activeScreen="Dashboard" 
      />
      
      {isSidebarOpen && Platform.OS !== 'web' ? (
        <TouchableOpacity 
            activeOpacity={1} 
            onPress={toggleSidebar} 
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 90 }]} 
        />
      ) : null}
      <View style={{ flex: 1, height: Platform.OS === 'web' ? '100vh' : 'auto' }}>
        <ScrollView 
          style={[styles.scrollView, Platform.OS === 'web' ? { height: '100vh' } : {}]}
          contentContainerStyle={[styles.scrollContent, { minHeight: '100%' }]}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.paddingContainer}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {Platform.OS !== 'web' ? (
                    <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                        <Ionicons name="menu" size={24} color="#1b264a" />
                    </TouchableOpacity>
                ) : null}
                <View>
                    <Text allowFontScaling={false} style={styles.headerLabel}>TERMINAL ACCESS</Text>
                    <Text allowFontScaling={false} style={styles.headerTitle}>{user?.name?.split(' ')[0]}'s Portal</Text>
                </View>
            </View>
            <View style={styles.headerActions}>
                {isLive ? (
                    <View style={styles.liveIndicator}>
                        <View style={styles.liveDot} />
                        <Text allowFontScaling={false} style={styles.liveText}>LIVE</Text>
                    </View>
                ) : null}
                <TouchableOpacity onPress={() => fetchRequests(false)} style={styles.syncBtn}>
                    <Ionicons name="refresh" size={16} color="#1b264a" />
                </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statsRow}>
            {['Total', 'Approved', 'Picked Up', 'Closed'].map(lbl => (
                <View key={lbl} style={styles.statBox}>
                    <Text allowFontScaling={false} style={styles.statValue}>
                        {lbl === 'Total' ? allRequests.length : 
                         lbl === 'Picked Up' ? allRequests.filter(r => r.status === 'PendingReturn').length :
                         allRequests.filter(r => r.status === lbl).length}
                    </Text>
                    <Text allowFontScaling={false} style={styles.statLabel}>{lbl.toUpperCase()}</Text>
                </View>
            ))}
          </View>

          {/* New Request CTA for Employee */}
          {user?.role === 'Employee' ? (
            <View style={styles.deadlineInfo}>
                <Ionicons name="time" size={16} color="#e11d48" />
                <Text allowFontScaling={false} style={styles.deadlineText}>Daily Deadline: Return material before 6:00 PM today to avoid penalties.</Text>
            </View>
          ) : null}

          {user?.role === 'Employee' ? (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => navigation.navigate('CreateRequest')}
              activeOpacity={0.85}
            >
              <View>
                <Text allowFontScaling={false} style={styles.createBtnText}>+ New Material Request</Text>
                <Text allowFontScaling={false} style={styles.createBtnSub}>Send request to admin for approval</Text>
              </View>
              <Ionicons name="cube" size={28} color="#ffc61c" />
            </TouchableOpacity>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text allowFontScaling={false} style={styles.sectionTitle}>
                {user?.role === 'Admin' ? 'ACTION REQUIRED' : 'MY ACTIVITY'}
            </Text>
            {requests.filter(r => r.status === 'Pending').length > 0 ? (
                <View style={styles.pendingBadge}>
                    <Text allowFontScaling={false} style={styles.pendingBadgeText}>
                        {requests.filter(r => r.status === 'Pending').length} PENDING
                    </Text>
                </View>
            ) : null}
          </View>

          {(() => {
              const grouped = requests.reduce((acc, req) => {
                  const date = new Date(req.date).toLocaleDateString();
                  if (!acc[date]) acc[date] = [];
                  acc[date].push(req);
                  return acc;
              }, {});

              return Object.keys(grouped).sort((a,b) => new Date(b) - new Date(a)).map(date => (
                  <View key={date} style={styles.dateSection}>
                      <View style={styles.dateHeader}>
                          <Ionicons name="calendar-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                          <Text style={styles.dateHeaderText}>{date === new Date().toLocaleDateString() ? 'ACTIVE TODAY' : date}</Text>
                      </View>
                      {grouped[date].map(item => <AnimatedCard key={item._id} item={item} />)}
                  </View>
              ));
          })()}

          {requests.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text allowFontScaling={false} style={styles.emptyText}>No transaction history found</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>

      <Modal visible={isModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsModalOpen(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
              <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={styles.modalContent}>
                      <View style={[styles.modalIndicator, modalMode === 'REJECT' || modalMode === 'PENALTY' ? { backgroundColor: '#e11d48' } : { backgroundColor: '#f59e0b' } ]} />
                      <Text allowFontScaling={false} style={styles.modalTitle}>
                          {modalMode === 'REJECT' ? 'Deny Request' : modalMode === 'PENALTY' ? 'Issue Penalty' : 'Direct Feedback'}
                      </Text>
                      <Text allowFontScaling={false} style={styles.modalSubtitle}>
                          Select a reason or provide custom instructions.
                      </Text>
                      
                      <View style={styles.presetGroup}>
                          <Text allowFontScaling={false} style={styles.presetLabel}>QUICK REASONS</Text>
                          <View style={styles.presetGrid}>
                              {reasons.map((r) => (
                                  <TouchableOpacity 
                                      key={r} 
                                      style={[
                                          styles.presetBtn,
                                          selectedPreset === r ? styles.presetBtnActive : styles.presetBtnInactive
                                      ]}
                                      onPress={() => {
                                          setSelectedPreset(r);
                                          if (!r.includes('Other')) {
                                              setCommentText(r);
                                          }
                                      }}
                                  >
                                      <Text allowFontScaling={false} style={[styles.presetBtnText, selectedPreset === r ? { color: '#ffffff' } : { color: '#475569' }]}>
                                          {r}
                                      </Text>
                                  </TouchableOpacity>
                              ))}
                          </View>
                      </View>
  
                      <TextInput 
                          style={styles.modalInput}
                          multiline
                          placeholder="Provide details..."
                          placeholderTextColor="#94a3b8"
                          value={commentText}
                          onChangeText={setCommentText}
                      />
  
                      <View style={styles.modalActions}>
                          <TouchableOpacity style={styles.modalCancel} onPress={() => setIsModalOpen(false)}>
                              <Text allowFontScaling={false} style={styles.modalCancelText}>CANCEL</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                              style={[styles.modalSubmit, modalMode === 'REJECT' || modalMode === 'PENALTY' ? { backgroundColor: '#e11d48' } : { backgroundColor: '#f59e0b' } ]}
                              onPress={() => {
                                  if (modalMode === 'REJECT') {
                                      handleUpdateStatus(selectedRequestId, 'Rejected', commentText, '');
                                  } else if (modalMode === 'PENALTY') {
                                      handleIssuePenalty(selectedRequestId, commentText);
                                  } else {
                                      handleUpdateStatus(selectedRequestId, 'Pending', '', commentText);
                                  }
                              }}
                          >
                              <Text allowFontScaling={false} style={styles.modalSubmitText}>
                                  {modalMode === 'REJECT' ? 'REJECT' : modalMode === 'PENALTY' ? 'PENALIZE' : 'NOTIFY'}
                              </Text>
                          </TouchableOpacity>
                      </View>
                  </View>
              </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full Screen Image Viewer Modal */}
      <Modal visible={viewerVisible} transparent={true} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
          <View style={styles.viewerOverlay}>
              <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerVisible(false)}>
                  <Text style={styles.viewerCloseText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.viewerTitle}>{viewerTitle}</Text>
              {viewerImage ? (
                  <Image source={{ uri: viewerImage }} style={styles.viewerImage} resizeMode="contain" />
              ) : null}
          </View>
      </Modal>

      {isSubmittingPhoto ? (
        <View style={styles.uploadOverlay}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.uploadOverlayText}>Uploading Evidence...</Text>
        </View>
      ) : null}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  paddingContainer: {
    padding: Platform.OS === 'web' ? 20 : 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 30 : 14,
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: Platform.OS === 'web' ? 24 : 19,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  syncBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  syncBtnText: {
    color: '#1b264a',
    fontSize: 9,
    fontWeight: '800',
  },
  mobileMenuBtn: {
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 2,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1e293b',
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: '#94a3b8',
    marginTop: 1,
    textAlign: 'center',
  },
  createBtn: {
    backgroundColor: '#1b264a',
    padding: 14,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderLeftWidth: 6,
    borderLeftColor: '#ffc61c',
    elevation: 4,
  },
  createBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deadlineInfo: {
    backgroundColor: '#fff1f2',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  deadlineText: {
    color: '#e11d48',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pendingBadgeText: {
    color: '#b45309',
    fontSize: 9,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 2,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: '#1b264a',
  },
  cardYellowStrip: {
    position: 'absolute',
    right: 24,
    top: 0,
    width: 30,
    height: 3,
    backgroundColor: '#ffc61c',
  },
  cardHeader: {
    padding: 14,
    paddingLeft: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  cardSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 2,
  },
  dueDate: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    marginTop: 4,
  },
  overdueText: {
    color: '#e11d48',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeEmerald: { backgroundColor: '#ecfdf5' },
  badgeRose: { backgroundColor: '#fff1f2' },
  badgeAmber: { backgroundColor: '#fffbeb' },
  badgeIndigo: { backgroundColor: '#eef2ff' },
  badgeText: { fontSize: 9, fontWeight: '800' },
  textEmerald: { color: '#059669' },
  textRose: { color: '#e11d48' },
  textAmber: { color: '#d97706' },
  textIndigo: { color: '#4f46e5' },
  cardDetails: {
    backgroundColor: '#f8fafc',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 12,
  },
  detailLabel: { fontSize: 9, fontWeight: '700', color: '#94a3b8', flexShrink: 0, width: '35%' },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#334155', flex: 1, textAlign: 'right' },
  detailValueIndigo: { fontSize: 13, fontWeight: '800', color: '#1b264a', flex: 1, textAlign: 'right' },
  photoSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 6,
    alignItems: 'center',
  },
  photoSectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  noPhotoText: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#cbd5e1',
  },
  photoContainer: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  photoBox: {
    alignItems: 'center',
  },
  photoLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#94a3b8',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  urgentBadge: {
    backgroundColor: '#fff1f2',
    padding: 10,
    marginHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  urgentBadgeText: { color: '#e11d48', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  waitingBadge: {
    backgroundColor: '#fffbeb',
    padding: 10,
    marginHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  waitingBadgeText: { color: '#d97706', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  penaltyBadge: {
    backgroundColor: '#fff1f2',
    padding: 6,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 10,
  },
  penaltyBadgeText: { color: '#e11d48', fontSize: 8, fontWeight: '900', textAlign: 'center' },
  noteBox: {
    backgroundColor: '#fffbeb',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 12,
  },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  noteLabel: { fontSize: 9, fontWeight: '800', color: '#d97706' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  noteText: { fontSize: 12, color: '#92400e', lineHeight: 18 },
  penaltyBox: {
    backgroundColor: '#fff1f2',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecdd3',
    marginBottom: 12,
  },
  penaltyLabel: { fontSize: 9, fontWeight: '800', color: '#e11d48', marginBottom: 4 },
  penaltyText: { fontSize: 12, color: '#9f1239' },
  rejectBox: {
    backgroundColor: '#f8fafc',
    padding: 16,
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  rejectLabel: { fontSize: 9, fontWeight: '800', color: '#64748b', marginBottom: 6 },
  rejectText: { fontSize: 12, color: '#1e293b', lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  footerTime: { fontSize: 8, fontWeight: '700', color: '#cbd5e1' },
  footerDate: { fontSize: 8, fontWeight: '700', color: '#94a3b8' },
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  actionBtn: { flex: 1, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  btnEmerald: { backgroundColor: '#10b981' },
  btnAmber: { backgroundColor: '#f59e0b' },
  btnRose: { backgroundColor: '#e11d48' },
  btnIndigo: { backgroundColor: '#4f46e5' },
  btnGreen: { backgroundColor: '#059669' },
  btnText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  emptyBox: { padding: 60, alignItems: 'center', borderRadius: 24, borderStyle: 'dashed', borderWidth: 1, borderColor: '#e2e8f0' },
  emptyText: { color: '#94a3b8', fontSize: 14, fontWeight: '600', fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.8)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#ffffff', borderRadius: 32, padding: 24 },
  modalIndicator: { height: 4, width: 60, alignSelf: 'center', borderRadius: 2, marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 24 },
  presetGroup: { marginBottom: 20 },
  presetLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', marginBottom: 12 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  presetBtnActive: { backgroundColor: '#1e293b', borderColor: '#1e293b' },
  presetBtnInactive: { backgroundColor: '#f8fafc', borderColor: '#f1f5f9' },
  presetBtnText: { fontSize: 11, fontWeight: '700' },
  modalInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20, padding: 16, height: 120, textAlignVertical: 'top', fontSize: 15, color: '#1e293b', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, backgroundColor: '#f1f5f9', height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  modalCancelText: { color: '#475569', fontSize: 13, fontWeight: '800' },
  modalSubmit: { flex: 2, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', elevation: 8 },
  modalSubmitText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  viewerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  viewerClose: { position: 'absolute', top: 50, right: 30, backgroundColor: 'rgba(255,255,255,0.1)', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  viewerCloseText: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  viewerTitle: { position: 'absolute', top: 60, color: '#ffffff', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  viewerImage: { width: Dimensions.get('window').width * 0.9, height: Dimensions.get('window').height * 0.7 },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(27,38,74,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  uploadOverlayText: { color: '#ffffff', marginTop: 12, fontWeight: '800', letterSpacing: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, fontSize: 12, fontWeight: '700', color: '#1b264a', letterSpacing: 2 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 120, flexGrow: 1 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dcfce7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0' },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#16a34a' },
  liveText: { color: '#44af6cff', fontSize: 8, fontWeight: '500', letterSpacing: 1 },
  // Employee Profile Card
  profileCard: { backgroundColor: '#1b264a', borderRadius: 16, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderLeftWidth: 6, borderLeftColor: '#ffc61c' },
  profileLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 14 },
  profileAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffc61c', alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: 22, fontWeight: '900', color: '#1b264a' },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
  profileEmail: { fontSize: 11, color: '#94a3b8', marginBottom: 4 },
  profileBadgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  profileBadge: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  profileBadgeText: { fontSize: 10, fontWeight: '800', color: '#15803d' },
  logoutSmallBtn: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginLeft: 10 },
  logoutSmallText: { color: '#e11d48', fontSize: 10, fontWeight: '800' },
  createBtnSub: { color: '#94a3b8', fontSize: 11, marginTop: 3 },
  dateSection: { marginBottom: 24 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  dateHeaderText: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1 },
});

export default DashboardScreen;
