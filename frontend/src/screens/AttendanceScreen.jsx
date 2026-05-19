import React, { useState, useContext, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet,
    ActivityIndicator, Animated, useWindowDimensions, TextInput, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { BASE_URL } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Toast from 'react-native-toast-message';
import io from 'socket.io-client';

const AttendanceScreen = ({ navigation }) => {
    const { user } = useContext(AuthContext);
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [leaveReason, setLeaveReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
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
            const res = await api.get('/attendance/my-attendance');
            setAttendance(res.data);
        } catch (err) {
            console.error('Failed to fetch attendance', err.message, err.response?.data);
            Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to load attendance' });
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
        } catch (e) {
            console.log('Bell sound error:', e);
        }
    };

    useEffect(() => {
        fetchAttendance();

        // Socket for real-time notifications
        socketRef.current = io(BASE_URL, { transports: ['polling', 'websocket'] });

        socketRef.current.on('attendanceUpdated', (data) => {
            if (String(data.userId) === String(user?._id) || String(data.userId) === String(user?.id)) {
                playBell();
                const isApproved = data.attendance?.status === 'Approved';
                Toast.show({
                    type: isApproved ? 'success' : 'error',
                    text1: `🔔 Attendance ${isApproved ? 'Approved' : 'Rejected'}`,
                    text2: `Your ${data.attendance?.type} request for ${data.attendance?.date} was ${data.attendance?.status}.`,
                    visibilityTime: 6000
                });
                fetchAttendance();
            }
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [user]);

    const markAttendance = async (type = 'Present', reason = '') => {
        setSubmitting(true);
        try {
            await api.post('/attendance/mark', { type, reason });
            Toast.show({ type: 'success', text1: '✅ Marked!', text2: type === 'Leave' ? 'Leave request submitted for approval.' : 'Attendance marked for today!' });
            fetchAttendance();
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Error', text2: err.response?.data?.msg || 'Could not mark attendance' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleLeaveSubmit = () => {
        if (!leaveReason.trim()) {
            Toast.show({ type: 'error', text1: 'Required', text2: 'Please provide a reason for leave.' });
            return;
        }
        setShowLeaveModal(false);
        markAttendance('Leave', leaveReason.trim());
        setLeaveReason('');
    };

    const todayString = new Date().toLocaleDateString('en-CA');
    const todayRecord = attendance.find(a => a.date === todayString);

    return (
        <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: isMobile ? 'column' : 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
            <Sidebar user={user} navigation={navigation} logout={() => {}} sidebarAnim={sidebarAnim} toggleSidebar={toggleSidebar} activeScreen="Attendance" />
            {isSidebarOpen && (Platform.OS !== 'web' || isMobile) && (
                <TouchableOpacity activeOpacity={1} onPress={toggleSidebar} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 90 }]} />
            )}

            {/* Leave Reason Modal */}
            <Modal visible={showLeaveModal} transparent animationType="fade" onRequestClose={() => setShowLeaveModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <View style={styles.modalHeader}>
                            <Ionicons name="document-text" size={28} color="#1b264a" />
                            <Text style={styles.modalTitle}>Leave Request</Text>
                        </View>
                        <Text style={styles.modalSubtitle}>Please provide a reason for your leave</Text>
                        <TextInput
                            style={styles.reasonInput}
                            placeholder="e.g. Medical appointment, Personal work..."
                            placeholderTextColor="#94a3b8"
                            value={leaveReason}
                            onChangeText={setLeaveReason}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowLeaveModal(false); setLeaveReason(''); }}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.submitLeaveBtn} onPress={handleLeaveSubmit}>
                                <Text style={styles.submitLeaveBtnText}>Submit Leave</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
                <ScrollView
                    style={{ flex: 1, ...(Platform.OS === 'web' ? { height: '100vh', overflow: 'auto' } : {}) }}
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                >
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {(Platform.OS !== 'web' || isMobile) && (
                                <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                                    <Ionicons name="menu" size={24} color="#1b264a" />
                                </TouchableOpacity>
                            )}
                            <View>
                                <Text allowFontScaling={false} style={styles.headerLabel}>MODULE</Text>
                                <Text allowFontScaling={false} style={styles.headerTitle}>My Attendance</Text>
                            </View>
                        </View>
                    </View>

                    {/* Today Card */}
                    <View style={styles.todayCard}>
                        <Ionicons name="calendar" size={32} color="#1b264a" style={{ marginBottom: 8 }} />
                        <Text style={styles.todayLabel}>TODAY</Text>
                        <Text style={styles.todayDate}>{new Date().toDateString()}</Text>

                        {todayRecord ? (
                            <View style={[styles.markedBadge, todayRecord.type === 'Leave' ? styles.leaveBadge : styles.presentBadge]}>
                                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                                <Text style={styles.markedBadgeText}>{todayRecord.type} — {todayRecord.status}</Text>
                            </View>
                        ) : (
                            <View style={styles.actionButtons}>
                                <TouchableOpacity style={styles.presentBtn} onPress={() => markAttendance('Present')} disabled={submitting}>
                                    {submitting ? <ActivityIndicator color="#fff" /> : (
                                        <>
                                            <Ionicons name="person-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                                            <Text style={styles.presentBtnText}>MARK PRESENT</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.leaveBtn} onPress={() => setShowLeaveModal(true)} disabled={submitting}>
                                    <Ionicons name="document-text" size={18} color="#1b264a" style={{ marginRight: 6 }} />
                                    <Text style={styles.leaveBtnText}>REQUEST LEAVE</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* History */}
                    <Text style={styles.sectionTitle}>Attendance History</Text>
                    {loading ? (
                        <ActivityIndicator size="large" color="#1b264a" style={{ marginTop: 20 }} />
                    ) : attendance.length === 0 ? (
                        <Text style={styles.emptyText}>No records yet. Mark your first attendance above!</Text>
                    ) : (
                        attendance.map((record) => (
                            <View key={record._id} style={styles.recordItem}>
                                <View style={[styles.typeIcon, record.type === 'Leave' ? styles.leaveIcon : styles.presentIcon]}>
                                    <Ionicons name={record.type === 'Leave' ? 'document-text' : 'person-circle'} size={20} color="#fff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.recordDate}>{record.date}</Text>
                                    <Text style={styles.recordType}>{record.type}{record.reason ? ` — ${record.reason}` : ''}</Text>
                                </View>
                                <View style={[styles.statusBadge, record.status === 'Approved' ? styles.badgeApproved : record.status === 'Rejected' ? styles.badgeRejected : styles.badgePending]}>
                                    <Text style={styles.statusText}>{record.status}</Text>
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
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    headerLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 1 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
    mobileMenuBtn: { backgroundColor: '#ffffff', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    todayCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
    todayLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 2, marginBottom: 4 },
    todayDate: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 20 },
    markedBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, gap: 8 },
    presentBadge: { backgroundColor: '#10b981' },
    leaveBadge: { backgroundColor: '#f59e0b' },
    markedBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    actionButtons: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
    presentBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1b264a', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderBottomWidth: 3, borderBottomColor: '#ffc61c' },
    presentBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
    leaveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: '#fcd34d' },
    leaveBtnText: { color: '#1b264a', fontWeight: 'bold', fontSize: 13 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 16 },
    emptyText: { color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
    recordItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', gap: 12 },
    typeIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    presentIcon: { backgroundColor: '#10b981' },
    leaveIcon: { backgroundColor: '#f59e0b' },
    recordDate: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
    recordType: { fontSize: 12, color: '#64748b', marginTop: 2 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    badgeApproved: { backgroundColor: '#dcfce7' },
    badgeRejected: { backgroundColor: '#fee2e2' },
    badgePending: { backgroundColor: '#fef3c7' },
    statusText: { fontSize: 11, fontWeight: 'bold', color: '#1e293b' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalBox: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
    modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
    reasonInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 14, color: '#0f172a', height: 100, marginBottom: 20 },
    modalActions: { flexDirection: 'row', gap: 12 },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', backgroundColor: '#f8fafc' },
    cancelBtnText: { fontWeight: '700', color: '#64748b' },
    submitLeaveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#1b264a', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#ffc61c' },
    submitLeaveBtnText: { color: '#fff', fontWeight: 'bold' }
});

export default AttendanceScreen;
