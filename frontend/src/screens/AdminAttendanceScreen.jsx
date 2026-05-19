import React, { useState, useContext, useEffect, useRef } from 'react';
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
            setAttendance(res.data);
        } catch (err) {
            console.error('Failed to fetch attendance', err.message, err.response?.data);
            Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to load' });
        } finally {
            setLoading(false);
        }
    };

    // Bell notification sound
    const playBell = () => {
        try {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
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
        } catch (e) { console.log('Bell sound error', e); }
    };

    useEffect(() => {
        fetchAttendance();

        socketRef.current = io(BASE_URL, { transports: ['polling', 'websocket'] });

        socketRef.current.on('attendanceNew', (data) => {
            playBell();
            const name = data.attendance?.user?.name || 'An employee';
            const type = data.attendance?.type || 'Present';
            Toast.show({
                type: 'info',
                text1: `🔔 New ${type} Request`,
                text2: `${name} submitted a ${type.toLowerCase()} request for ${data.attendance?.date}`,
                visibilityTime: 6000
            });
            fetchAttendance();
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [user]);

    const handleAction = async (id, status) => {
        try {
            await api.put(`/attendance/${id}/action`, { status });
            Toast.show({ type: 'success', text1: `✅ ${status}`, text2: `Attendance has been ${status.toLowerCase()}.` });
            fetchAttendance();
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Error', text2: 'Could not update status' });
        }
    };

    const filters = ['All', 'Pending', 'Approved', 'Rejected'];
    const pendingCount = attendance.filter(a => a.status === 'Pending').length;
    const filtered = filter === 'All' ? attendance : attendance.filter(a => a.status === filter);

    return (
        <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: isMobile ? 'column' : 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
            <Sidebar user={user} navigation={navigation} logout={() => {}} sidebarAnim={sidebarAnim} toggleSidebar={toggleSidebar} activeScreen="AdminAttendance" />
            {isSidebarOpen && (Platform.OS !== 'web' || isMobile) && (
                <TouchableOpacity activeOpacity={1} onPress={toggleSidebar} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 90 }]} />
            )}

            <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
                <ScrollView
                    style={{ flex: 1, ...(Platform.OS === 'web' ? { height: '100vh', overflow: 'auto' } : {}) }}
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
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
                    </View>

                    {/* Filter Pills */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
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
                                    <Text style={styles.recordDate}>{record.date} • {new Date(record.timestamp).toLocaleTimeString()}</Text>
                                    {record.reason ? (
                                        <View style={styles.reasonBox}>
                                            <Ionicons name="chatbubble-ellipses-outline" size={12} color="#64748b" />
                                            <Text style={styles.reasonText}>{record.reason}</Text>
                                        </View>
                                    ) : null}
                                </View>

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
    emptyText: { color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: 40, fontSize: 14 },
    recordItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', gap: 12 },
    recordItemPending: { borderColor: '#fcd34d', borderWidth: 1.5 },
    typeIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    presentIcon: { backgroundColor: '#10b981' },
    leaveIcon: { backgroundColor: '#f59e0b' },
    recordName: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
    recordEmployeeId: { fontSize: 12, color: '#64748b' },
    recordDate: { fontSize: 12, color: '#64748b', marginTop: 3 },
    reasonBox: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, backgroundColor: '#f8fafc', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    reasonText: { fontSize: 11, color: '#475569', flex: 1 },
    actionRow: { flexDirection: 'row', gap: 8 },
    actionBtn: { padding: 10, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    approveBtn: { backgroundColor: '#10b981' },
    rejectBtn: { backgroundColor: '#ef4444' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    badgeApproved: { backgroundColor: '#dcfce7' },
    badgeRejected: { backgroundColor: '#fee2e2' },
    statusText: { fontSize: 11, fontWeight: 'bold', color: '#1e293b' }
});

export default AdminAttendanceScreen;
