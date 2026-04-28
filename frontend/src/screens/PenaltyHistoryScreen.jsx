import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Platform, ActivityIndicator, FlatList, Image, Modal, Dimensions, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { BASE_URL } from '../services/api';
import Sidebar from '../components/Sidebar';
import { AuthContext } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import io from 'socket.io-client';

const PenaltyHistoryScreen = ({ navigation }) => {
  const { user, logout } = useContext(AuthContext);
  const [requests, setRequests] = useState({});
  const [employeeGroups, setEmployeeGroups] = useState([]);
  const [stats, setStats] = useState({ total: 0, distinctEmployees: 0, last24h: 0 });
  const [isLoading, setIsLoading] = useState(true);
  
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const sidebarWidth = Platform.OS === 'web' ? Math.min(280, width * 0.85) : 280;
  const sidebarVisible = Platform.OS === 'web' && !isMobile;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(sidebarVisible ? 0 : -sidebarWidth)).current;
  const [activeTab, setActiveTab] = useState('Timeline'); // Timeline or Leaderboard
  const [expandedEmpId, setExpandedEmpId] = useState(null);

  // Image Viewer State
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [viewerTitle, setViewerTitle] = useState('');

  const toggleSidebar = () => {
    const toValue = isSidebarOpen ? -sidebarWidth : 0;
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
            // Refresh if a request is penalized
            if (data?.request?.status === 'Penalized') {
                console.log('[PENALTY-SOCKET] Auto-refreshing history...');
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
      
      const penalized = res.data.filter(r => r.status === 'Penalized');

      // Calculate Stats
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
      const last24hCount = penalized.filter(r => new Date(r.penaltyIssuedAt || r.date) > oneDayAgo).length;
      const distinctEmps = new Set(penalized.map(r => r.employeeId)).size;
      
      setStats({
        total: penalized.length,
        distinctEmployees: distinctEmps,
        last24h: last24hCount
      });

      // 1. Timeline Grouping
      let timelineFiltered = penalized;
      if (user?.role === 'Employee' && user?.employeeId) {
        timelineFiltered = penalized.filter(r => r.employeeId === user.employeeId);
      }

      const timelineGrouped = timelineFiltered.reduce((acc, req) => {
        const date = new Date(req.penaltyIssuedAt || req.date).toLocaleDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(req);
        return acc;
      }, {});
      setRequests(timelineGrouped);

      // 2. Leaderboard Grouping (Only for Admin)
      if (user?.role === 'Admin') {
        const empMap = penalized.reduce((acc, req) => {
            const key = req.employeeId || 'Unknown';
            if (!acc[key]) {
                acc[key] = {
                    id: key,
                    name: req.employeeName || 'Unknown Employee',
                    email: req.employeeEmail || '',
                    penalties: [],
                    totalCount: 0
                };
            }
            acc[key].penalties.push(req);
            acc[key].totalCount += 1;
            return acc;
        }, {});

        const sortedEmployees = Object.values(empMap).sort((a,b) => b.totalCount - a.totalCount);
        setEmployeeGroups(sortedEmployees);
      }

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

  const HistoryCard = ({ item }) => (
    <View style={styles.card}>
        <View style={styles.cardMain}>
            <View style={styles.iconContainer}>
                <Ionicons name="alert-circle" size={20} color="#f43f5e" />
            </View>
            <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text allowFontScaling={false} style={styles.materialName}>{item.materialName}</Text>
                    <View style={styles.idBadge}>
                        <Text allowFontScaling={false} style={styles.idText}>{item.requestId}</Text>
                    </View>
                </View>
                <Text allowFontScaling={false} style={styles.employeeInfo}>
                    By {item.employeeName} ({item.employeeId})
                </Text>
                <View style={styles.penaltyDetailBox}>
                    <Text allowFontScaling={false} style={styles.penaltyMsg}>"{item.penalty || 'Violation of return policy'}"</Text>
                </View>

                {((item.remark || '').toString().trim() !== '') ? (
                    <View style={styles.remarkBubble}>
                        <Ionicons name="chatbubble-ellipses" size={16} color="#0891b2" />
                        <Text allowFontScaling={false} style={styles.remarkBubbleText}>
                            {(item.remark || '').toString().trim()}
                        </Text>
                    </View>
                ) : null}

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
            </View>
        </View>

        <View style={styles.cardFooter}>
            <Text allowFontScaling={false} style={styles.footerDate}>Issued: {new Date(item.penaltyIssuedAt || item.date).toLocaleString()}</Text>
        </View>
    </View>
  );

  const StatCard = ({ label, value, icon, color }) => (
    <View style={styles.statCard}>
        <View style={[styles.statIconContainer, { backgroundColor: color + '15' }]}>
            <Ionicons name={icon} size={18} color={color} />
        </View>
        <View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    </View>
  );

  if (isLoading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#1b264a" />
      <Text style={styles.loadingText}>Accessing Analytics...</Text>
    </View>
  );

  return (
    <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: isMobile ? 'column' : 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
      <Sidebar 
          user={user}
          navigation={navigation} 
          logout={logout}
          sidebarAnim={sidebarAnim}
          toggleSidebar={toggleSidebar}
          activeScreen="PenaltyHistory" 
      />
      
      {isSidebarOpen && (Platform.OS !== 'web' || isMobile) && (
        <TouchableOpacity 
            activeOpacity={1} 
            onPress={toggleSidebar} 
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 90 }]} 
        />
      )}

      <View style={{ flex: 1, height: Platform.OS === 'web' ? '100vh' : 'auto' }}>
        <ScrollView style={[styles.scrollView, Platform.OS === 'web' ? { height: '100vh' } : {}]} contentContainerStyle={[styles.scrollContent, { minHeight: '100%' }]} >
        <View style={styles.paddingContainer}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {(Platform.OS !== 'web' || isMobile) && (
                    <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                      <Ionicons name="menu" size={24} color="#1b264a" />
                    </TouchableOpacity>
                )}
                <View>
                    <Text allowFontScaling={false} style={styles.headerLabel}>COMPLIANCE ANALYTICS</Text>
                    <Text allowFontScaling={false} style={styles.headerTitle}>Penalty Oversight</Text>
                </View>
            </View>
          </View>

          {user?.role?.toLowerCase() === 'admin' && (
              <View style={styles.tabContainer}>
                  <TouchableOpacity 
                      style={[styles.tab, activeTab === 'Timeline' && styles.activeTab]} 
                      onPress={() => setActiveTab('Timeline')}
                  >
                      <Text style={[styles.tabText, activeTab === 'Timeline' && styles.activeTabText]}>TIMELINE LOG</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                      style={[styles.tab, activeTab === 'Leaderboard' && styles.activeTab]} 
                      onPress={() => setActiveTab('Leaderboard')}
                  >
                      <Text style={[styles.tabText, activeTab === 'Leaderboard' && styles.activeTabText]}>ANALYTICS VIEW</Text>
                  </TouchableOpacity>
              </View>
          )}

          {/* Analytics Stats Summary */}
          {user?.role?.toLowerCase() === 'admin' && (
            <View style={styles.statsRow}>
                <StatCard label="TOTAL PENALTIES" value={stats.total} icon="alert-circle" color="#f43f5e" />
                <StatCard label="OFFENDERS" value={stats.distinctEmployees} icon="people" color="#1b264a" />
                <StatCard label="LAST 24H" value={stats.last24h} icon="time" color="#ffc61c" />
            </View>
          )}

          {activeTab === 'Timeline' ? (
                Object.keys(requests).sort((a,b) => new Date(b) - new Date(a)).map(date => (
                    <View key={date} style={styles.dateSection}>
                        <View style={styles.dateHeader}>
                            <Ionicons name="alert-circle-outline" size={14} color="#f43f5e" style={{ marginRight: 6 }} />
                            <Text style={styles.dateHeaderText}>{date === new Date().toLocaleDateString() ? 'TODAY' : date}</Text>
                        </View>
                        {requests[date].map((item) => <HistoryCard key={item._id} item={item} />)}
                    </View>
                ))
          ) : (
                employeeGroups.map((emp) => (
                    <View key={emp.id} style={styles.employeeSummaryBox}>
                        <TouchableOpacity 
                            style={styles.empBoxHeader}
                            onPress={() => setExpandedEmpId(expandedEmpId === emp.id ? null : emp.id)}
                            activeOpacity={0.7}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={styles.empName}>{emp.name}</Text>
                                <Text style={styles.empId}>ID: {emp.id} • {emp.totalCount} items</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={styles.scoreBadge}>
                                    <Text style={styles.scoreText}>{emp.totalCount}</Text>
                                    <Text style={styles.scoreLabel}>PENALTIES</Text>
                                </View>
                                <Ionicons 
                                    name={expandedEmpId === emp.id ? "chevron-up" : "chevron-down"} 
                                    size={20} 
                                    color="#94a3b8" 
                                />
                            </View>
                        </TouchableOpacity>
                        
                        {expandedEmpId === emp.id && (
                            <View style={styles.penaltyList}>
                                <Text style={styles.listTitle}>DETAILED HISTORY:</Text>
                                {emp.penalties.map((p) => (
                                    <View key={p._id} style={styles.penaltyListItem}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Text style={styles.itemName}>• {p.materialName}</Text>
                                            <Text style={styles.itemDate}>{new Date(p.penaltyIssuedAt || p.date).toLocaleDateString()}</Text>
                                        </View>
                                        <Text style={styles.penaltyDetail}>"{p.penalty || 'Violation'}"</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                ))
          )}

          {(activeTab === 'Timeline' && Object.keys(requests).length === 0) || (activeTab === 'Leaderboard' && employeeGroups.length === 0) ? (
            <View style={styles.emptyBox}>
              <Text allowFontScaling={false} style={styles.emptyText}>No disciplinary records found</Text>
            </View>
          ) : null}
        </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: '#f8fafc' },
  paddingContainer: { padding: Platform.OS === 'web' ? 24 : 16 },
  header: { marginBottom: Platform.OS === 'web' ? 30 : 16 },
  headerLabel: { fontSize: 10, fontWeight: '800', color: '#ffc61c', letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#1b264a' },
  
  statsRow: { 
    flexDirection: 'row', 
    gap: 12, 
    marginBottom: 24,
    flexWrap: 'wrap'
  },
  statCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '900', color: '#1b264a' },
  statLabel: { fontSize: 8, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5 },

  tabContainer: { flexDirection: 'row', backgroundColor: '#e2e8f0', padding: 4, borderRadius: 12, marginTop: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#ffffff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  tabText: { fontSize: 10, fontWeight: '900', color: '#64748b' },
  activeTabText: { color: '#1b264a' },

  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  cardMain: { flexDirection: 'row', gap: 12 },
  iconContainer: { width: 40, height: 40, backgroundColor: '#fff1f2', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  materialName: { fontSize: 15, fontWeight: '800', color: '#1b264a' },
  idBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  idText: { fontSize: 9, fontWeight: '800', color: '#64748b' },
  employeeInfo: { fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: '600' },
  penaltyDetailBox: { marginTop: 8, padding: 8, backgroundColor: '#f8fafc', borderRadius: 8, borderLeftWidth: 2, borderLeftColor: '#f43f5e' },
  penaltyMsg: { fontSize: 11, color: '#64748b', fontStyle: 'italic' },
  cardFooter: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  footerDate: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },

  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, color: '#1b264a', fontWeight: '800', fontSize: 12 },

  employeeSummaryBox: { backgroundColor: '#ffffff', borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  empBoxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empName: { fontSize: 16, fontWeight: 'bold', color: '#1b264a' },
  empId: { fontSize: 10, color: '#94a3b8', fontWeight: '600', marginTop: 2 },
  scoreBadge: { backgroundColor: '#fff1f2', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, alignItems: 'center' },
  scoreText: { fontSize: 16, fontWeight: '900', color: '#f43f5e' },
  scoreLabel: { fontSize: 6, fontWeight: '800', color: '#fb7185' },
  penaltyList: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 8 },
  listTitle: { fontSize: 9, fontWeight: '800', color: '#94a3b8', marginBottom: 4 },
  penaltyListItem: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#f43f5e' },
  itemName: { fontSize: 12, fontWeight: '700', color: '#334155' },
  itemDate: { fontSize: 9, color: '#94a3b8', fontWeight: '600' },
  penaltyDetail: { fontSize: 11, color: '#64748b', marginTop: 4 },

  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 120, flexGrow: 1 },
  mobileMenuBtn: { padding: 8 },
  dateSection: { marginBottom: 24 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dateHeaderText: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1 },
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
  photoSectionHeader: { marginTop: 12, marginBottom: 8 },
  photoSectionTitle: { fontSize: 8, fontWeight: '800', color: '#94a3b8' },
  photoContainer: { gap: 12 },
  photoBox: { alignItems: 'center' },
  photoLabel: { fontSize: 8, fontWeight: '800', color: '#94a3b8', marginBottom: 4 },
  cardImage: { width: 50, height: 50, borderRadius: 8, backgroundColor: '#f1f5f9' },
  viewerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  viewerClose: { position: 'absolute', top: 50, right: 30, backgroundColor: 'rgba(255,255,255,0.1)', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  viewerTitle: { position: 'absolute', top: 60, color: '#ffffff', fontSize: 14, fontWeight: '800' },
  viewerImage: { width: Dimensions.get('window').width * 0.9, height: Dimensions.get('window').height * 0.7 },
});

export default PenaltyHistoryScreen;
