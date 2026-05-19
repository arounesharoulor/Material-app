import React, { useState, useContext, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import {
    View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet,
    ActivityIndicator, Animated, useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { BASE_URL } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Toast from 'react-native-toast-message';
import io from 'socket.io-client';

const AdminAttendanceScreen = ({ navigation }) => {
    const { user } = useContext(AuthContext);
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [filter, setFilter] = useState('All'); // All | Pending | Approved | Rejected
    const [activeTab, setActiveTab] = useState('attendance'); // attendance | leave
    const socketRef = useRef(null);

    const { width } = useWindowDimensions();
    const isMobile = width < 768;
    const sidebarWidth = Platform.OS === 'web' ? Math.min(280, width * 0.85) : 280;
    const sidebarAnim = useRef(new Animated.Value(-sidebarWidth)).current;

    const toggleSidebar = () => {
        const toValue = isSidebarOpen ? -sidebarWidth : 0;
        Animated.timing(sidebarAnim, { toValue, duration: 300, useNativeDriver: true }).start();
        setIsSidebarOpen(!isSidebarOpen);
    };

    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const res = await api.get('/attendance/all');
            setAttendance(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Failed to fetch attendance', err.message, err.response?.data);
            Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to load' });
        } finally {
            setLoading(false);
        }
    };

    // Bell notification sound
    const playBell = async () => {
        try {
            if (Platform.OS === 'web') {
                if (typeof window !== 'undefined') {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (AudioContext) {
                        const ctx = new AudioContext();
                        const oscillator = ctx.createOscillator();
                        const gainNode = ctx.createGain();
                        oscillator.connect(gainNode);
                        gainNode.connect(ctx.destination);
                        oscillator.type = 'sine';
                        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
                        oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
                        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
                        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                        oscillator.start(ctx.currentTime);
                        oscillator.stop(ctx.currentTime + 0.5);
                    }
                }
            } else {
                const uri = 'https://www.myinstants.com/media/sounds/iphone-notification.mp3';
                const { sound } = await Audio.Sound.createAsync(
                    { uri },
                    { shouldPlay: true, volume: 1.0 }
                );
                setTimeout(() => {
                    sound.unloadAsync().catch(() => {});
                }, 5000);
            }
        } catch (e) { console.log('Bell sound error', e); }
    };

    useEffect(() => {
        fetchAttendance();

        socketRef.current = io(BASE_URL, { transports: ['polling', 'websocket'] });

        socketRef.current.on('attendanceNew', (data) => {
            if (data && data.attendance) {
                playBell();
                const name = data.attendance?.user?.name || 'An employee';
                const type = data.attendance?.type || 'Present';
                const reqDate = data.attendance?.date;
                const dateObj = reqDate ? new Date(reqDate + 'T00:00:00') : new Date();
                const formattedDate = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                
                const reasonStr = data.attendance?.reason ? `\nReason: ${data.attendance.reason}` : '';
                const leaveTypeStr = data.attendance?.leaveType ? ` (${data.attendance.leaveType})` : '';
                Toast.show({
                    type: 'info',
                    text1: `🔔 New ${type} Request${leaveTypeStr}`,
                    text2: `${name} requested ${type.toLowerCase()} for ${formattedDate} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${reasonStr}`,
                    visibilityTime: 10000
                });
                fetchAttendance();
            }
        });

        socketRef.current.on('attendanceCheckout', (data) => {
            if (data && data.attendance) {
                playBell();
                const name = data.attendance?.user?.name || 'An employee';
                Toast.show({
                    type: 'info',
                    text1: `🔔 Checkout Completed`,
                    text2: `${name} has completed their work and is waiting for you to close the day.`,
                    visibilityTime: 6000
                });
                fetchAttendance();
            }
        });

        socketRef.current.on('attendanceUpdated', () => {
            fetchAttendance();
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [user]);

    const formatTime = (time) => {
        if (!time) return 'N/A';
        const d = new Date(time);
        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const handleAction = async (id, status) => {
        try {
            await api.put(`/attendance/${id}/action`, { status });
            Toast.show({ type: 'success', text1: `✅ ${status}`, text2: `Attendance has been ${status.toLowerCase()}.` });
            fetchAttendance();
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Error', text2: 'Could not update status' });
        }
    };

    const handleCloseDay = async (id) => {
        try {
            await api.put(`/attendance/${id}/close`);
            Toast.show({ type: 'success', text1: '✅ Closed', text2: 'Daily attendance has been closed and approved.' });
            fetchAttendance();
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Error', text2: 'Could not close day' });
        }
    };

    const filters = ['All', 'Pending', 'PendingClose', 'Approved', 'Rejected'];
    const pendingCount = Array.isArray(attendance) ? attendance.filter(a => a.status === 'Pending').length : 0;
    const pendingCloseCount = Array.isArray(attendance) ? attendance.filter(a => a.checkOutStatus === 'PendingClose').length : 0;

    const tabFiltered = Array.isArray(attendance) ? 
                        (activeTab === 'attendance' 
                            ? attendance.filter(a => a.type !== 'Leave') 
                            : attendance.filter(a => a.type === 'Leave')) 
                        : [];

    const filtered = !Array.isArray(attendance) ? [] :
                     filter === 'All' ? tabFiltered : 
                     filter === 'PendingClose' ? tabFiltered.filter(a => a.checkOutStatus === 'PendingClose') :
                     tabFiltered.filter(a => a.status === filter);

    return (
        <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: isMobile ? 'column' : 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
            <Sidebar user={user} navigation={navigation} logout={() => {}} sidebarAnim={sidebarAnim} toggleSidebar={toggleSidebar} activeScreen="AdminAttendance" />
            {isSidebarOpen && (Platform.OS !== 'web' || isMobile) && (
                <TouchableOpacity activeOpacity={1} onPress={toggleSidebar} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 90 }]} />
            )}

            <View style={{ flex: 1, backgroundColor: '#f8fafc', height: Platform.OS === 'web' ? '100vh' : 'auto' }}>
                <ScrollView
                    style={[{ flex: 1 }, Platform.OS === 'web' ? { height: '100vh' } : {}]}
                    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {(Platform.OS !== 'web' || isMobile) && (
                                <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                                    <Ionicons name="menu" size={24} color="#1b264a" />
                                </TouchableOpacity>
                            )}
                            <View>
                                <Text allowFontScaling={false} style={styles.headerLabel}>ADMIN</Text>
                                <Text allowFontScaling={false} style={styles.headerTitle}>Attendance Review</Text>
                            </View>
                        </View>
                        {pendingCount > 0 && (
                            <View style={styles.pendingBell}>
                                <Ionicons name="notifications" size={18} color="#ffc61c" />
                                <Text style={styles.pendingBellText}>{pendingCount} Pending</Text>
                            </View>
                        )}
                        {pendingCloseCount > 0 && (
                            <View style={[styles.pendingBell, { backgroundColor: '#f59e0b' }]}>
                                <Ionicons name="log-out" size={18} color="#fff" />
                                <Text style={[styles.pendingBellText, { color: '#fff' }]}>{pendingCloseCount} Closing</Text>
                            </View>
                        )}
                    </View>

                    {/* Tab Switcher */}
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'attendance' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('attendance')}
                        >
                            <Ionicons name="calendar-outline" size={18} color={activeTab === 'attendance' ? '#ffc61c' : '#64748b'} />
                            <Text style={[styles.tabButtonText, activeTab === 'attendance' && styles.tabButtonTextActive]}>
                                Attendance
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'leave' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('leave')}
                        >
                            <Ionicons name="document-text-outline" size={18} color={activeTab === 'leave' ? '#ffc61c' : '#64748b'} />
                            <Text style={[styles.tabButtonText, activeTab === 'leave' && styles.tabButtonTextActive]}>
                                Leave requests
                            </Text>
                        </TouchableOpacity>
                    </View>

                   

                    {/* Filter Pills */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ alignItems: 'center' }}>
                        {filters.map(f => (
                            <TouchableOpacity
                                key={f}
                                onPress={() => setFilter(f)}
                                style={[styles.filterPill, filter === f && styles.filterPillActive]}
                            >
                                <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>{f}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Records */}
                    {loading ? (
                        <ActivityIndicator size="large" color="#1b264a" />
                    ) : filtered.length === 0 ? (
                        <Text style={styles.emptyText}>No {filter !== 'All' ? filter.toLowerCase() : ''} records found.</Text>
                    ) : (
                        filtered.map((record) => (
                            <View key={record._id} style={[styles.recordItem, record.status === 'Pending' && styles.recordItemPending]}>
                                <View style={[styles.typeIcon, record.type === 'Leave' ? styles.leaveIcon : styles.presentIcon]}>
                                    <Ionicons name={record.type === 'Leave' ? 'document-text' : 'person-circle'} size={20} color="#fff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={styles.recordName}>{record.user?.name}</Text>
                                        <Text style={styles.recordEmployeeId}>({record.user?.employeeId})</Text>
                                    </View>
                                    <Text style={styles.recordDate}>{record.date} • Check-in: {formatTime(record.timestamp || record.checkInTime)}</Text>
                                    {record.checkOutTime && (
                                        <Text style={styles.checkoutTime}>Check-out: {formatTime(record.checkOutTime)}</Text>
                                    )}
                                    {record.reason ? (
                                        <View style={styles.reasonBox}>
                                            <Ionicons name="chatbubble-ellipses-outline" size={12} color="#64748b" />
                                            <Text style={styles.reasonText}>{record.leaveType ? `${record.leaveType}: ` : ''}{record.reason}</Text>
                                        </View>
                                    ) : record.leaveType ? (
                                        <View style={styles.reasonBox}>
                                            <Ionicons name="alert-circle-outline" size={12} color="#64748b" />
                                            <Text style={styles.reasonText}>{record.leaveType}</Text>
                                        </View>
                                    ) : null}
                                </View>

                                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                                    {record.status === 'Pending' ? (
                                        <View style={styles.actionRow}>
                                            <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleAction(record._id, 'Rejected')}>
                                                <Ionicons name="close" size={18} color="#fff" />
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleAction(record._id, 'Approved')}>
                                                <Ionicons name="checkmark" size={18} color="#fff" />
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <View style={[styles.statusBadge, record.status === 'Approved' ? styles.badgeApproved : styles.badgeRejected]}>
                                            <Text style={styles.statusText}>{record.status}</Text>
                                        </View>
                                    )}

                                    {record.status === 'Approved' && record.checkOutStatus === 'PendingClose' && (
                                        <TouchableOpacity style={styles.closeDayBtn} onPress={() => handleCloseDay(record._id)}>
                                            <Ionicons name="shield-checkmark" size={14} color="#fff" style={{ marginRight: 4 }} />
                                            <Text style={styles.closeDayBtnText}>APPROVE CLOSE</Text>
                                        </TouchableOpacity>
                                    )}

                                    {record.checkOutStatus === 'ClosedApproved' && (
                                        <View style={[styles.statusBadge, { backgroundColor: '#10b98120' }]}>
                                            <Text style={[styles.statusText, { color: '#10b981' }]}>Day Closed</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        ))
                    )}
                </ScrollView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 1 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
    mobileMenuBtn: { backgroundColor: '#ffffff', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    pendingBell: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1b264a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 6 },
    pendingBellText: { color: '#ffc61c', fontWeight: 'bold', fontSize: 12 },
    filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', marginRight: 8 },
    filterPillActive: { backgroundColor: '#1b264a', borderColor: '#1b264a' },
    filterPillText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
    filterPillTextActive: { color: '#ffc61c' },
    policyCard: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
    policyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    policyTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
    policyContent: { paddingLeft: 4, gap: 6 },
    policyItem: { fontSize: 12, color: '#475569', lineHeight: 18 },
    policyBold: { fontWeight: '700', color: '#1e293b' },
    historySection: { marginTop: 10 },
    emptyText: { color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: 40, fontSize: 14 },
    recordItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', gap: 12 },
    recordItemPending: { borderColor: '#fcd34d', borderWidth: 1.5 },
    typeIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    presentIcon: { backgroundColor: '#10b981' },
    leaveIcon: { backgroundColor: '#f59e0b' },
    recordName: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
    recordEmployeeId: { fontSize: 12, color: '#64748b' },
    recordDate: { fontSize: 12, color: '#64748b', marginTop: 3 },
    checkoutTime: { fontSize: 11, color: '#10b981', marginTop: 2, fontWeight: '600' },
    reasonBox: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, backgroundColor: '#f8fafc', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    reasonText: { fontSize: 11, color: '#475569', flex: 1 },
    actionRow: { flexDirection: 'row', gap: 8 },
    actionBtn: { padding: 10, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    approveBtn: { backgroundColor: '#10b981' },
    rejectBtn: { backgroundColor: '#ef4444' },
    closeDayBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    closeDayBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 10 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    badgeApproved: { backgroundColor: '#dcfce7' },
    badgeRejected: { backgroundColor: '#fee2e2' },
    statusText: { fontSize: 11, fontWeight: 'bold', color: '#1e293b' },

    // Tab Switcher Styles
    tabContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
    tabButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, gap: 8 },
    tabButtonActive: { backgroundColor: '#1b264a', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    tabButtonText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    tabButtonTextActive: { color: '#ffffff', fontWeight: '700' }
});

export default AdminAttendanceScreen;
