import React, { useContext, useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, Animated, Modal, StyleSheet, Dimensions, ActivityIndicator, Image, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tw from 'twrnc';
import { AuthContext } from '../context/AuthContext';
import api, { BASE_URL } from '../services/api';
import Sidebar from '../components/Sidebar';

const AcceptedHistoryScreen = ({ navigation }) => {
  const { user, logout } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(-280)).current;

  useFocusEffect(
    React.useCallback(() => {
        if (Platform.OS === 'web') return;
        const onBackPress = () => {
            navigation.navigate('Dashboard');
            return true;
        };
        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [navigation])
  );

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

  useFocusEffect(
    React.useCallback(() => {
        fetchRequests();

        // Real-time synchronization
        const socket = io(BASE_URL, { transports: ['websocket'] });
        socket.on('requestUpdated', (data) => {
            // Refresh if the updated request is now Closed/Accepted
            if (data?.request?.status === 'Closed' || data?.request?.status === 'PendingReturn' || data?.request?.status === 'Approved') {
                console.log('[ACCEPTED-SOCKET] Auto-refreshing history...');
                fetchRequests(true); 
            }
        });

        return () => {
            if (socket) socket.disconnect();
        };
    }, [])
  );

  const fetchRequests = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const res = await api.get('/requests');
      
      const sorted = res.data.filter(r => r.status === 'Closed');
      
      // Filter by user if Employee
      let filtered = sorted;
      if (user?.role === 'Employee' && user?.employeeId) {
        filtered = sorted.filter(r => r.employeeId === user.employeeId);
      }
      
      // Group by date
      const grouped = filtered.reduce((acc, req) => {
        const date = new Date(req.date).toLocaleDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(req);
        return acc;
      }, {});

      setRequests(grouped);
    } catch (err) {
      console.log('Error fetching requests');
    } finally {
      setIsLoading(false);
    }
  };

  const getFullImageUrl = (path) => {
    if (!path) return null;
    let cleanPath = path.toString().trim().replace(/\\/g, '/');
    const uploadsIndex = cleanPath.indexOf('uploads/');
    if (uploadsIndex !== -1) {
        cleanPath = cleanPath.substring(uploadsIndex);
    } else {
        const filename = cleanPath.split('/').pop();
        cleanPath = `uploads/${filename}`;
    }
    const encodedPath = cleanPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `${BASE_URL}/${encodedPath}`;
  };

  const openViewer = (path, title) => {
    const url = getFullImageUrl(path);
    if (!url) return;
    setViewerImage(url);
    setViewerTitle(title);
    setViewerVisible(true);
  };

  const HistoryCard = ({ item }) => {
    return (
        <View style={styles.card}>
            <View style={[styles.cardAccent, { backgroundColor: '#10b981' }]} />
            <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={styles.cardTitle}>{item.materialName}</Text>
                    <Text allowFontScaling={false} style={styles.cardSubtitle}>ID: {item.requestId}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: '#ecfdf5' }]}>
                    <Text allowFontScaling={false} style={[styles.badgeText, { color: '#059669' }]}>ACCEPTED</Text>
                </View>
            </View>

            <View style={styles.cardDetails}>
                <View style={styles.detailRow}>
                    <Text allowFontScaling={false} style={styles.detailLabel}>REQUESTED BY</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text allowFontScaling={false} style={styles.detailValue}>{item.employeeName} ({item.employeeId})</Text>
                        {item.employeeEmail ? <Text allowFontScaling={false} style={{ fontSize: 10, color: '#64748b' }}>{item.employeeEmail}</Text> : null}
                    </View>
                </View>
                {!item.materialName.toLowerCase().includes('general inquiry') && (
                    <View style={styles.detailRow}>
                        <Text allowFontScaling={false} style={styles.detailLabel}>QUANTITY</Text>
                        <Text allowFontScaling={false} style={styles.detailValue}>{item.quantity} Units</Text>
                    </View>
                )}
                {((item.remark || '').toString().trim() !== '') ? (
                    <View style={styles.remarkBubble}>
                        <Ionicons name="chatbubble-ellipses" size={16} color="#0891b2" />
                        <Text allowFontScaling={false} style={styles.remarkBubbleText}>
                            {(item.remark || '').toString().trim()}
                        </Text>
                    </View>
                ) : null}
            </View>

            <View style={styles.photoSectionHeader}>
                <Text style={styles.photoSectionTitle}>EVIDENCE ARCHIVE</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoContainer}>
                {item.photoUrl && (
                    <TouchableOpacity style={styles.photoBox} onPress={() => openViewer(item.photoUrl, 'Reference Photo')}>
                        <Text style={styles.photoLabel}>Ref</Text>
                        <Image source={{ uri: getFullImageUrl(item.photoUrl) }} style={styles.cardImage} resizeMode="contain" />
                    </TouchableOpacity>
                )}
                {item.pickupPhotoUrl && (
                    <TouchableOpacity style={styles.photoBox} onPress={() => openViewer(item.pickupPhotoUrl, 'Pickup Proof')}>
                        <Text style={styles.photoLabel}>Pickup</Text>
                        <Image source={{ uri: getFullImageUrl(item.pickupPhotoUrl) }} style={styles.cardImage} resizeMode="contain" />
                    </TouchableOpacity>
                )}
                {item.returnPhotoUrl && (
                    <TouchableOpacity style={styles.photoBox} onPress={() => openViewer(item.returnPhotoUrl, 'Return Proof')}>
                        <Text style={styles.photoLabel}>Return</Text>
                        <Image source={{ uri: getFullImageUrl(item.returnPhotoUrl) }} style={styles.cardImage} resizeMode="contain" />
                    </TouchableOpacity>
                )}
            </ScrollView>
            <View style={styles.cardFooter}>
                <View>
                    <Text allowFontScaling={false} style={styles.footerTime}>{new Date(item.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text>
                    <Text allowFontScaling={false} style={styles.footerDate}>{new Date(item.inTime).toLocaleDateString()}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {item.pickupTime && (
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.footerLabel}>PICKUP TIME</Text>
                            <Text style={styles.footerValue}>{new Date(item.pickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</Text>
                        </View>
                    )}
                    {item.returnTime && (
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.footerLabel}>RETURN TIME</Text>
                            <Text style={styles.footerValue}>{new Date(item.returnTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
  };

  if (isLoading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#1b264a" />
      <Text style={styles.loadingText}>Accessing Vault...</Text>
    </View>
  );

  return (
    <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
      <Sidebar 
          user={user} 
          navigation={navigation} 
          logout={logout} 
          sidebarAnim={sidebarAnim} 
          toggleSidebar={toggleSidebar} 
          activeScreen="AcceptedHistory" 
      />
      <View style={{ flex: 1, height: Platform.OS === 'web' ? '100vh' : 'auto' }}>
        <ScrollView style={[styles.scrollView, Platform.OS === 'web' ? { height: '100vh' } : {}]} contentContainerStyle={[styles.scrollContent, { minHeight: '100%' }]} >
        <View style={styles.paddingContainer}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {Platform.OS !== 'web' && (
                    <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                        <Ionicons name="menu" size={24} color="#1b264a" />
                    </TouchableOpacity>
                )}
                <View>
                    <Text allowFontScaling={false} style={styles.headerLabel}>LOGISTICS ARCHIVE</Text>
                    <Text allowFontScaling={false} style={styles.headerTitle}> Accepted History</Text>
                </View>
            </View>
          </View>

          {Object.keys(requests).sort((a,b) => new Date(b) - new Date(a)).map(date => (
            <View key={date} style={styles.dateSection}>
                <View style={styles.dateHeader}>
                    <Ionicons name="calendar-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                    <Text style={styles.dateHeaderText}>{date === new Date().toLocaleDateString() ? 'TODAY' : date}</Text>
                </View>
                {requests[date].map((item) => <HistoryCard key={item._id} item={item} />)}
            </View>
          ))}

          {Object.keys(requests).length === 0 && (
            <View style={styles.emptyBox}>
              <Text allowFontScaling={false} style={styles.emptyText}>No accepted records found</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
      <Modal visible={viewerVisible} transparent={true} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
          <View style={styles.viewerOverlay}>
              <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerVisible(false)}>
                  <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.viewerTitle}>{viewerTitle}</Text>
              {viewerImage && <Image source={{ uri: viewerImage }} style={styles.viewerImage} resizeMode="contain" />}
          </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  paddingContainer: { padding: Platform.OS === 'web' ? 20 : 14 },
  header: { marginBottom: Platform.OS === 'web' ? 30 : 14 },
  headerLabel: { fontSize: 9, fontWeight: '700', color: '#94a3b8', letterSpacing: 1 },
  headerTitle: { fontSize: Platform.OS === 'web' ? 24 : 19, fontWeight: 'bold', color: '#0f172a' },
  card: { backgroundColor: '#ffffff', borderRadius: 24, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden' },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  cardHeader: { padding: Platform.OS === 'web' ? 20 : 14, paddingLeft: Platform.OS === 'web' ? 26 : 18, flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  cardSubtitle: { fontSize: 10, fontWeight: '700', color: '#94a3b8' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 9, fontWeight: '800' },
  cardDetails: { backgroundColor: '#f8fafc', padding: 16, marginHorizontal: 20, borderRadius: 16, marginBottom: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12 },
  detailLabel: { fontSize: 9, fontWeight: '700', color: '#94a3b8', flexShrink: 0, width: '35%' },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#334155', flex: 1, textAlign: 'right' },
  remarkBubble: {
    backgroundColor: '#ecfeff',
    padding: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#cffafe',
  },
  remarkBubbleText: {
    flex: 1,
    fontSize: 13,
    color: '#0e7490',
    fontWeight: '600',
    fontStyle: 'italic',
  },
  photoSectionHeader: { paddingHorizontal: 24, marginBottom: 8 },
  photoSectionTitle: { fontSize: 9, fontWeight: '800', color: '#94a3b8' },
  photoContainer: { paddingHorizontal: 20, gap: 12, marginBottom: 16 },
  photoBox: { alignItems: 'center' },
  photoLabel: { fontSize: 8, fontWeight: '800', color: '#94a3b8', marginBottom: 4 },
  cardImage: { width: 60, height: 60, borderRadius: 10, backgroundColor: '#f1f5f9' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 20, alignItems: 'center' },
  footerTime: { fontSize: 10, fontWeight: '700', color: '#1e293b' },
  footerDate: { fontSize: 9, fontWeight: '700', color: '#94a3b8' },
  footerLabel: { fontSize: 8, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5 },
  footerValue: { fontSize: 13, fontWeight: '800', color: '#059669', marginTop: 2 },
  emptyBox: { padding: 60, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#e2e8f0' },
  emptyText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  viewerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  viewerClose: { position: 'absolute', top: 50, right: 30, backgroundColor: 'rgba(255,255,255,0.1)', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  viewerCloseText: { color: '#ffffff', fontSize: 20 },
  viewerTitle: { position: 'absolute', top: 60, color: '#ffffff', fontSize: 14, fontWeight: '800' },
  viewerImage: { width: Dimensions.get('window').width * 0.9, height: Dimensions.get('window').height * 0.7 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, fontSize: 12, fontWeight: '700', color: '#1b264a' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 120, flexGrow: 1 },
  mobileMenuBtn: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateSection: { marginBottom: 24 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  dateHeaderText: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1 },
  employeeRemarkBox: {
    backgroundColor: '#ecfeff',
    padding: 12,
    marginTop: 10,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0891b2',
  },
  remarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  remarkLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0891b2',
    letterSpacing: 0.5,
  },
  remarkText: {
    fontSize: 12,
    color: '#164e63',
    lineHeight: 18,
    fontWeight: '500',
  },
});

export default AcceptedHistoryScreen;
