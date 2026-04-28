import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, Platform, StyleSheet, Linking, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { BASE_URL } from '../services/api';
import io from 'socket.io-client';
import Toast from 'react-native-toast-message';
import { AuthContext } from '../context/AuthContext';

const SidebarItem = ({ label, iconName, targetScreen, isActive, badgeCount = 0, navigation, toggleSidebar, user }) => {
    const [isHovered, setIsHovered] = useState(false);
    return (
        <TouchableOpacity 
            style={[
                styles.sidebarItem, 
                isActive && styles.sidebarItemActive,
                (!isActive && isHovered && Platform.OS === 'web') && { backgroundColor: 'rgba(255,255,255,0.05)' }
            ]} 
            onPress={() => {
                if(Platform.OS !== 'web') toggleSidebar();
                navigation.navigate(targetScreen);
            }}
            onMouseEnter={() => Platform.OS === 'web' && setIsHovered(true)}
            onMouseLeave={() => Platform.OS === 'web' && setIsHovered(false)}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Ionicons 
                    name={isActive ? iconName : iconName + "-outline"} 
                    size={18} 
                    color={isActive ? "#1b264a" : "#94a3b8"} 
                    style={{ marginRight: 12 }}
                />
                <Text allowFontScaling={false} style={isActive ? styles.sidebarItemTextActive : styles.sidebarItemText}>
                    {label}
                </Text>
            </View>
            {badgeCount > 0 && (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badgeCount}</Text>
                </View>
            )}
            {isHovered && Platform.OS === 'web' && badgeCount > 0 && (() => {
                let msg = 'Attention required';
                if (label === 'DASHBOARD') {
                    msg = user?.role === 'Admin'
                        ? `${badgeCount} request${badgeCount > 1 ? 's' : ''} awaiting your approval`
                        : `${badgeCount} item${badgeCount > 1 ? 's' : ''} approved or needing your update`;
                } else if (label === 'REQUEST HISTORY') {
                    msg = `${badgeCount} item${badgeCount > 1 ? 's' : ''} pending return`;
                } else if (label === 'STOCK CONTROL') {
                    msg = 'One or more materials are running low';
                }
                return (
                    <View style={styles.tooltip}>
                        <View style={styles.tooltipArrow} />
                        <Text allowFontScaling={false} style={styles.tooltipText}>{msg}</Text>
                    </View>
                );
            })()}
        </TouchableOpacity>
    );
};

const Sidebar = ({ 
    user, 
    navigation, 
    logout, 
    sidebarAnim, 
    toggleSidebar, 
    activeScreen 
}) => {
    const { refreshUser } = useContext(AuthContext);
    const { width } = useWindowDimensions();
    const isMobile = width < 768;
    const [pendingCount, setPendingCount] = useState(0);       // Admin: awaiting decision
    const [employeePickupCount, setEmployeePickupCount] = useState(0);  // Employee: approved, needs pickup / feedback
    const [employeeReturnCount, setEmployeeReturnCount] = useState(0);  // Employee: picked up, needs return
    const [lowStockCount, setLowStockCount] = useState(0);      // Admin: Stock below threshold
    const [highPenaltyUsers, setHighPenaltyUsers] = useState([]); // Admin: users with score >= 10
    const socketRef = useRef(null);

    const fetchCounts = async () => {
        try {
            const res = await api.get('/requests');
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            if (user?.role === 'Admin') {
                // Only count PENDING requests — items awaiting admin decision.
                // Admin: Count ALL pending requests regardless of date
                const pending = res.data.filter(r => r.status === 'Pending').length;
                setPendingCount(pending);

                // Fetch Stock Levels for Admin
                const stockRes = await api.get('/stock');
                const lowStockMaterials = stockRes.data.filter(s => s.quantity < 10).map(s => s.materialName.toLowerCase());
                
                // Also count any requests currently blocked by insufficient stock
                const blockedMaterials = res.data.filter(r => r.status === 'Pending' && r.insufficientStock).map(r => r.materialName.toLowerCase());
                
                const uniqueNeedsUpdate = [...new Set([...lowStockMaterials, ...blockedMaterials])].length;
                setLowStockCount(uniqueNeedsUpdate);

                // Fetch High Penalty Users
                const penaltyRes = await api.get('/admin/high-penalty');
                setHighPenaltyUsers(penaltyRes.data);

            } else {
                // Employee: APPROVED from today → go pick it up
                const pickup = res.data.filter(r =>
                    r.status === 'Approved' &&
                    r.employeeId === user?.employeeId &&
                    new Date(r.date) >= startOfToday
                ).length;

                // Employee: PENDING but has admin comment → needs update/feedback
                const needsUpdate = res.data.filter(r =>
                    r.status === 'Pending' &&
                    r.employeeId === user?.employeeId &&
                    r.adminComment && r.adminComment.length > 0
                ).length;

                // Employee: PENDING RETURN → return the material
                const needsReturn = res.data.filter(r =>
                    r.status === 'PendingReturn' &&
                    r.employeeId === user?.employeeId
                ).length;

                setEmployeePickupCount(pickup + needsUpdate);
                setEmployeeReturnCount(needsReturn);
            }
        } catch (err) {
            console.log(`[SIDEBAR] Failed to fetch counts from ${BASE_URL}/api/requests:`, err.message);
            if (err.message === 'Network Error') {
              console.log('[DEBUG] This usually means the IP in api.js is wrong or Firewall is blocking port 5000');
            }
        }
    };

    useEffect(() => {
        fetchCounts();
        
        if (!socketRef.current) {
            socketRef.current = io(BASE_URL, {
                transports: ['polling', 'websocket'],
                reconnection: true,
                reconnectionAttempts: 20,
            });

            socketRef.current.on('connect', () => {
                console.log('[SIDEBAR-SOCKET] Connected to:', BASE_URL);
            });

            socketRef.current.on('connect_error', (err) => {
                console.log('[SIDEBAR-SOCKET] Connection Error:', err.message);
            });
        }

        socketRef.current.on('requestUpdated', fetchCounts);
        socketRef.current.on('roleUpdated', fetchCounts);
        socketRef.current.on('userUpdated', () => {
            fetchCounts();
            refreshUser();
        });
        
        socketRef.current.on('returnReminder', (data) => {
            if (user?.employeeId === data.employeeId) {
                Toast.show({
                    type: 'info',
                    text1: '🔔 Return Reminder',
                    text2: data.message,
                    visibilityTime: 6000,
                });
            }
        });

        socketRef.current.on('notification', (data) => {
            console.log('[SIDEBAR-SOCKET] Incoming notification:', data);
            if (user?.role === 'Admin' && data.role === 'Admin') {
                console.log('[SIDEBAR-SOCKET] Admin alert accepted and showing Toast');
                Toast.show({
                    type: data.type === 'critical' ? 'error' : 'info',
                    text1: data.title,
                    text2: data.message,
                    visibilityTime: 8000,
                });
                fetchCounts(); // Refresh counts when notification received
            } else if (user?.role === 'Employee' && data.type === 'penalty' && data.userId === user._id) {
                // Targeted notification for current employee
                console.log('[SIDEBAR-SOCKET] Employee penalty alert accepted');
                Toast.show({
                    type: 'error',
                    text1: data.title,
                    text2: data.message,
                    visibilityTime: 8000,
                });
                fetchCounts(); 
                refreshUser(); // Update user object to show new score in sidebar
            } else {
                console.log(`[SIDEBAR-SOCKET] Alert rejected. Admin role: ${user?.role}, Data role: ${data.role}`);
            }
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [user]);

    return (
        <Animated.View style={[
            styles.sidebar,
            (Platform.OS !== 'web' || isMobile) && { 
                position: 'absolute', 
                zIndex: 100, 
                backgroundColor: '#1b264a',
                top: 0,
                bottom: 0,
                left: 0,
                transform: [{ translateX: sidebarAnim || 0 }] 
            }
        ]}>
            <ScrollView 
                style={[{ flex: 1 }, Platform.OS === 'web' ? { overflowY: 'auto' } : {}]} 
                contentContainerStyle={{ 
                    flexGrow: 1, 
                    padding: 30, 
                    paddingBottom: Platform.OS === 'web' ? 100 : 40 
                }}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.sidebarTop}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10 }}>
                        <View style={styles.sidebarBrandContainer}>
                            <Text allowFontScaling={false} style={styles.sidebarBrand}>SYSTEM</Text>
                            <Text allowFontScaling={false} style={styles.sidebarBrandSub}>PORTAL</Text>
                        </View>
                        {(Platform.OS !== 'web' || isMobile) && (
                            <TouchableOpacity onPress={toggleSidebar} style={{ padding: 10 }}>
                                <Ionicons name="close" size={24} color="#ffc61c" />
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={styles.sidebarDivider} />
                    
                    <View style={styles.sidebarNav}>
                        <SidebarItem 
                            label="DASHBOARD" 
                            iconName="grid" 
                            targetScreen="Dashboard" 
                            isActive={activeScreen === 'Dashboard'}
                            badgeCount={user?.role === 'Admin' ? pendingCount : employeePickupCount}
                            navigation={navigation}
                            toggleSidebar={toggleSidebar}
                            user={user}
                        />
                        <SidebarItem 
                            label="MY PROFILE" 
                            iconName="person" 
                            targetScreen="Profile" 
                            isActive={activeScreen === 'Profile'}
                            navigation={navigation}
                            toggleSidebar={toggleSidebar}
                            user={user}
                        />

                        {user?.role === 'Admin' && (
                            <>
                                <SidebarItem 
                                    label="STOCK CONTROL" 
                                    iconName="cube" 
                                    targetScreen="Stock" 
                                    isActive={activeScreen === 'Stock'}
                                    badgeCount={lowStockCount}
                                    navigation={navigation}
                                    toggleSidebar={toggleSidebar}
                                    user={user}
                                />
                                <SidebarItem 
                                    label="ANALYTICS" 
                                    iconName="bar-chart" 
                                    targetScreen="Reports" 
                                    isActive={activeScreen === 'Reports'}
                                    navigation={navigation}
                                    toggleSidebar={toggleSidebar}
                                    user={user}
                                />
                            </>
                        )}

                        <View style={styles.navLabelContainer}>
                            <Text style={styles.navLabel}>ARCHIVE</Text>
                        </View>

                        <SidebarItem 
                            label="REQUEST HISTORY" 
                            iconName="list" 
                            targetScreen="History" 
                            isActive={activeScreen === 'History'}
                            badgeCount={user?.role === 'Employee' ? employeeReturnCount : 0}
                            navigation={navigation}
                            toggleSidebar={toggleSidebar}
                            user={user}
                        />
                        
                        <SidebarItem 
                            label="CLOSED HISTORY" 
                            iconName="checkmark-circle" 
                            targetScreen="AcceptedHistory" 
                            isActive={activeScreen === 'AcceptedHistory'}
                            navigation={navigation}
                            toggleSidebar={toggleSidebar}
                            user={user}
                        />
                        <SidebarItem 
                            label="REJECTED HISTORY" 
                            iconName="close-circle" 
                            targetScreen="RejectedHistory" 
                            isActive={activeScreen === 'RejectedHistory'}
                            navigation={navigation}
                            toggleSidebar={toggleSidebar}
                            user={user}
                        />
                        <SidebarItem 
                            label="PENALTY HISTORY" 
                            iconName="alert-circle" 
                            targetScreen="PenaltyHistory" 
                            isActive={activeScreen === 'PenaltyHistory'}
                            navigation={navigation}
                            toggleSidebar={toggleSidebar}
                            user={user}
                        />
                    </View>
                </View>

                <View style={styles.sidebarBottom}>
                    {Platform.OS === 'web' && (
                        <TouchableOpacity 
                            style={styles.sidebarDownload} 
                            onPress={() => {
                                // Explicitly trigger download by targeting the renamed APK
                                const url = typeof window !== 'undefined' ? `${window.location.origin}/MaterialManagingStore.apk` : '/MaterialManagingStore.apk';
                                Linking.openURL(url);
                            }}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="cloud-download" size={18} color="#ffc61c" style={{ marginRight: 10 }} />
                            <Text allowFontScaling={false} style={styles.sidebarDownloadText}>GET MOBILE APP</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.sidebarLogout} onPress={logout}>
                        <Ionicons name="log-out-outline" size={18} color="#ffffff" style={{ marginRight: 10 }} />
                        <Text allowFontScaling={false} style={styles.sidebarLogoutText}>LOGOUT</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
  sidebar: {
    width: Platform.OS === 'web' ? 'min(280px, 85%)' : 280,
    backgroundColor: '#1b264a',
    height: Platform.OS === 'web' ? '100vh' : '100%',
    borderRightWidth: 1,
    borderRightColor: '#2d3a5e',
  },
  sidebarTop: {
    flex: 1,
  },
  sidebarBrandContainer: {
    marginBottom: 10,
  },
  sidebarBrand: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  sidebarBrandSub: {
    color: '#ffc61c',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: -4,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: '#2d3a5e',
    width: '100%',
    marginVertical: 30,
  },
  sidebarNav: {
    gap: 8,
  },
  navLabelContainer: {
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  navLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  sidebarItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sidebarItemActive: {
    backgroundColor: '#ffc61c',
  },
  sidebarItemText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sidebarItemTextActive: {
    color: '#1b264a',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  badge: {
    backgroundColor: '#ff4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  sidebarBottom: {
    paddingTop: 40,
    borderTopWidth: 1,
    borderTopColor: '#2d3a5e',
  },
  sidebarLogout: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sidebarLogoutText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  sidebarDownload: {
    backgroundColor: 'rgba(255, 198, 28, 0.1)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 198, 28, 0.2)',
    marginBottom: 12,
  },
  sidebarDownloadText: {
    color: '#ffc61c',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  tooltip: {
    position: 'absolute',
    left: 40,
    top: 45,
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    zIndex: 1000,
    width: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 20,
  },
  tooltipArrow: {
    position: 'absolute',
    left: 20,
    top: -6,
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderTopWidth: 0,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#0f172a',
    borderLeftColor: 'transparent',
  },
  tooltipText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  flaggedItem: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.2)',
  },
  flaggedName: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  flaggedDetail: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  highestPenaltyItem: {
    borderColor: '#ffc61c',
    borderWidth: 1.5,
    backgroundColor: 'rgba(255, 198, 28, 0.05)',
  },
  highestBadge: {
    backgroundColor: '#ffc61c',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  highestBadgeText: {
    color: '#1b264a',
    fontSize: 7,
    fontWeight: '900',
  },
  penaltySummary: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  penaltySummaryText: {
    color: '#94a3b8',
    fontSize: 8,
    fontWeight: '500',
    marginBottom: 1,
  },
});

export default Sidebar;
