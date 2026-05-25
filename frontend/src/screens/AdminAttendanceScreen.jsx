import React, { useState, useContext, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import {
    View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet,
    ActivityIndicator, Animated, useWindowDimensions, Linking, Image, Modal
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
    const [selectedPhoto, setSelectedPhoto] = useState(null);
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
                const uri = 'https://raw.githubusercontent.com/zmxv/react-native-sound-demo/master/bell.mp3';
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

    const filters = ['All', 'Pending', 'Waiting', 'PendingClose', 'Approved', 'Rejected'];
    const pendingCount = Array.isArray(attendance) ? attendance.filter(a => a.status === 'Pending' || a.status === 'Waiting').length : 0;
    const pendingCloseCount = Array.isArray(attendance) ? attendance.filter(a => a.checkOutStatus === 'PendingClose').length : 0;
    const waitingCount = Array.isArray(attendance) ? attendance.filter(a => a.status === 'Waiting').length : 0;
    const leaveCount = Array.isArray(attendance) ? attendance.filter(a => a.type === 'Leave' && (a.status === 'Pending' || a.status === 'Waiting')).length : 0;

    const tabFiltered = Array.isArray(attendance) ? 
                        (activeTab === 'attendance' 
                            ? attendance.filter(a => a.type !== 'Leave') 
                            : attendance.filter(a => a.type === 'Leave')) 
                        : [];

    const filtered = !Array.isArray(attendance) ? [] :
                     filter === 'All' ? tabFiltered : 
                     filter === 'PendingClose' ? tabFiltered.filter(a => a.checkOutStatus === 'PendingClose') :
                     filter === 'Waiting' ? tabFiltered.filter(a => a.status === 'Waiting') :
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
                            <Image 
                                source={require('../../assets/Madhura Energy Logo-03 - Copy.svg')} 
                                style={styles.dashLogo} 
                                resizeMode="contain" 
                            />
                            <View>
                                <Text allowFontScaling={false} style={styles.headerLabel}>ADMIN</Text>
                                <Text allowFontScaling={false} style={styles.headerTitle}>Attendance Review</Text>
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            {pendingCount > 0 && (
                                <View style={styles.pendingBell}>
                                    <Ionicons name="notifications" size={16} color="#ffc61c" />
                                    <Text style={styles.pendingBellText}>{pendingCount} Pending</Text>
                                </View>
                            )}
                            {waitingCount > 0 && (
                                <View style={[styles.pendingBell, { backgroundColor: '#f59e0b20', borderWidth: 1, borderColor: '#f59e0b' }]}>
                                    <Ionicons name="time" size={16} color="#f59e0b" />
                                    <Text style={[styles.pendingBellText, { color: '#f59e0b' }]}>{waitingCount} Waiting</Text>
                                </View>
                            )}
                            {pendingCloseCount > 0 && (
                                <View style={[styles.pendingBell, { backgroundColor: '#f59e0b' }]}>
                                    <Ionicons name="log-out" size={16} color="#fff" />
                                    <Text style={[styles.pendingBellText, { color: '#fff' }]}>{pendingCloseCount} Closing</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Stats Header */}
                    <View style={styles.statsRow}>
                        <TouchableOpacity onPress={() => setFilter('All')} style={[styles.statCard, filter === 'All' && styles.statCardActive]}>
                            <Text style={styles.statLabel}>TOTAL</Text>
                            <Text style={styles.statValue}>{attendance.length}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setFilter('Pending')} style={[styles.statCard, filter === 'Pending' && styles.statCardActive]}>
                            <Text style={[styles.statLabel, { color: '#3b82f6' }]}>PENDING</Text>
                            <Text style={[styles.statValue, { color: '#3b82f6' }]}>{attendance.filter(a => a.status === 'Pending').length}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setFilter('Waiting')} style={[styles.statCard, filter === 'Waiting' && styles.statCardActive]}>
                            <Text style={[styles.statLabel, { color: '#f59e0b' }]}>WAITING</Text>
                            <Text style={[styles.statValue, { color: '#f59e0b' }]}>{waitingCount}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setFilter('Approved')} style={[styles.statCard, filter === 'Approved' && styles.statCardActive]}>
                            <Text style={[styles.statLabel, { color: '#10b981' }]}>OK</Text>
                            <Text style={[styles.statValue, { color: '#10b981' }]}>{attendance.filter(a => a.status === 'Approved').length}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Tab Switcher: Attendance / Leave Requests */}
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
                                Leave Requests
                            </Text>
                            {leaveCount > 0 && (
                                <View style={styles.leaveBadgeCount}>
                                    <Text style={styles.leaveBadgeCountText}>{leaveCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Filter Pills */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }} contentContainerStyle={{ gap: 8 }}>
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
                        <View style={styles.emptyContainer}>
                            <Ionicons name="documents-outline" size={48} color="#e2e8f0" />
                            <Text style={styles.emptyText}>No {filter !== 'All' ? filter.toLowerCase() : ''} records found.</Text>
                        </View>
                    ) : (
                        filtered.map((record) => {
                            const hasLocation = record.locationLat && record.locationLng;
                            const mapsUrl = hasLocation
                                ? `https://www.google.com/maps?q=${record.locationLat},${record.locationLng}`
                                : null;
                            const isWaiting = record.status === 'Waiting';
                            const photoUrl = record.photoUrl ? getFullImageUrl(record.photoUrl) : null;
                            const checkInTimeStr = formatTime(record.timestamp || record.checkInTime);

                            return (
                                <View key={record._id} style={[styles.recordItem, isWaiting && styles.recordItemWaiting]}>
                                    <View style={styles.recordHeader}>
                                        <View style={[styles.typeBadge, record.type === 'Leave' ? styles.badgeLeave : styles.badgePresent]}>
                                            <Ionicons name={record.type === 'Leave' ? 'document-text' : 'person'} size={12} color="#fff" />
                                            <Text style={styles.badgeText}>{record.type}</Text>
                                        </View>
                                        <Text style={styles.recordDateText}>{record.date}</Text>
                                    </View>

                                    <View style={styles.recordContent}>
                                        <View style={styles.userInfoRow}>
                                            <View style={styles.avatarPlaceholder}>
                                                <Text style={styles.avatarInitials}>{record.user?.name?.charAt(0) || 'E'}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.recordName}>{record.user?.name}</Text>
                                                <Text style={styles.recordEmployeeId}>ID: {record.user?.employeeId}</Text>
                                            </View>
                                            <View style={styles.timeInfo}>
                                                <Text style={styles.timeLabel}>CHECK-IN</Text>
                                                <Text style={styles.timeValue}>{checkInTimeStr}</Text>
                                            </View>
                                        </View>

                                        {record.reason ? (
                                            <View style={styles.reasonBlock}>
                                                <Text style={styles.reasonLabel}>{record.leaveType || 'Reason'}:</Text>
                                                <Text style={styles.reasonValue}>{record.reason}</Text>
                                            </View>
                                        ) : null}

                                        <View style={styles.evidenceGrid}>
                                            {photoUrl ? (
                                                <TouchableOpacity 
                                                    onPress={() => setSelectedPhoto(photoUrl)}
                                                    style={styles.evidencePhotoCard}
                                                >
                                                    <Image source={{ uri: photoUrl }} style={styles.evidenceImage} />
                                                    <View style={styles.evidenceOverlay}>
                                                        <Ionicons name="eye" size={16} color="#fff" />
                                                        <Text style={styles.evidenceOverlayText}>PHOTO EVIDENCE</Text>
                                                    </View>
                                                </TouchableOpacity>
                                            ) : record.type === 'Present' ? (
                                                <View style={[styles.evidencePhotoCard, { backgroundColor: '#fff7ed', borderWidth: 1, borderStyle: 'dashed', borderColor: '#f59e0b' }]}>
                                                    <Ionicons name="image-outline" size={24} color="#f59e0b" style={{ opacity: 0.5 }} />
                                                    <Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: 'bold', marginTop: 4 }}>NO PHOTO</Text>
                                                </View>
                                            ) : null}

                                            <View style={styles.locationCol}>
                                                {/* Mini Map Preview for Web */}
                                                {Platform.OS === 'web' && hasLocation && (
                                                    <View style={styles.miniMapContainer}>
                                                        <iframe
                                                            width="100%"
                                                            height="120"
                                                            frameBorder="0"
                                                            style={{ border: 0, borderRadius: 10 }}
                                                            src={`https://www.google.com/maps/embed/v1/view?key=YOUR_API_KEY_HERE&center=${record.locationLat},${record.locationLng}&zoom=16`}
                                                            // Fallback to non-API embed if no key (using place search)
                                                            srcDoc={`
                                                                <style>body{margin:0;overflow:hidden;}</style>
                                                                <iframe 
                                                                    width="100%" 
                                                                    height="120" 
                                                                    frameborder="0" 
                                                                    style="border:0;" 
                                                                    src="https://maps.google.com/maps?q=${record.locationLat},${record.locationLng}&z=16&output=embed" 
                                                                    allowfullscreen>
                                                                </iframe>
                                                            `}
                                                        />
                                                    </View>
                                                )}

                                                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                                                    {hasLocation && (
                                                        <TouchableOpacity
                                                            onPress={() => mapsUrl && Linking.openURL(mapsUrl)}
                                                            style={styles.locationLink}
                                                        >
                                                            <Ionicons name="location" size={14} color="#3b82f6" />
                                                            <Text style={styles.locationLinkText}>Full Map</Text>
                                                            <Ionicons name="chevron-forward" size={12} color="#3b82f6" />
                                                        </TouchableOpacity>
                                                    )}

                                                    {record.checkOutLat && record.checkOutLng && (
                                                        <TouchableOpacity
                                                            onPress={() => Linking.openURL(`https://www.google.com/maps?q=${record.checkOutLat},${record.checkOutLng}`)}
                                                            style={[styles.locationLink, { borderColor: '#fbcfe8', backgroundColor: '#fdf2f8' }]}
                                                        >
                                                            <Ionicons name="log-out" size={14} color="#db2777" />
                                                            <Text style={[styles.locationLinkText, { color: '#db2777' }]}>Out Map</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                                
                                                {record.checkOutTime && (
                                                    <View style={styles.checkoutBadge}>
                                                        <Ionicons name="time" size={12} color="#10b981" />
                                                        <Text style={styles.checkoutBadgeText}>OUT: {formatTime(record.checkOutTime)}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    </View>

                                    <View style={styles.recordFooter}>
                                        {(record.status === 'Pending' || isWaiting) ? (
                                            <View style={styles.actionGroup}>
                                                <TouchableOpacity 
                                                    style={[styles.footerActionBtn, { backgroundColor: '#fee2e2' }]} 
                                                    onPress={() => handleAction(record._id, 'Rejected')}
                                                >
                                                    <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 13 }}>REJECT</Text>
                                                </TouchableOpacity>
                                                
                                                {isWaiting && (
                                                    <TouchableOpacity 
                                                        style={[styles.footerActionBtn, { backgroundColor: '#fef3c7' }]} 
                                                        onPress={() => handleAction(record._id, 'Pending')}
                                                    >
                                                        <Text style={{ color: '#d97706', fontWeight: 'bold', fontSize: 13 }}>HOLD</Text>
                                                    </TouchableOpacity>
                                                )}

                                                <TouchableOpacity 
                                                    style={[styles.footerActionBtn, { backgroundColor: '#1b264a', flex: 2 }]} 
                                                    onPress={() => handleAction(record._id, 'Approved')}
                                                >
                                                    <Text style={{ color: '#ffc61c', fontWeight: 'bold', fontSize: 13 }}>APPROVE</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <View style={styles.statusFooter}>
                                                <View style={[styles.finalStatusBadge, record.status === 'Approved' ? styles.finalApproved : styles.finalRejected]}>
                                                    <Ionicons name={record.status === 'Approved' ? 'checkmark-circle' : 'close-circle'} size={14} color={record.status === 'Approved' ? '#10b981' : '#ef4444'} />
                                                    <Text style={[styles.finalStatusText, { color: record.status === 'Approved' ? '#10b981' : '#ef4444' }]}>{record.status.toUpperCase()}</Text>
                                                </View>

                                                {record.status === 'Approved' && record.checkOutStatus === 'PendingClose' && (
                                                    <TouchableOpacity style={styles.finalCloseBtn} onPress={() => handleCloseDay(record._id)}>
                                                        <Text style={styles.finalCloseBtnText}>CONFIRM CLOSE DAY</Text>
                                                        <Ionicons name="arrow-forward" size={14} color="#fff" />
                                                    </TouchableOpacity>
                                                )}

                                                {record.checkOutStatus === 'ClosedApproved' && (
                                                    <View style={styles.completeBadge}>
                                                        <Ionicons name="shield-checkmark" size={14} color="#64748b" />
                                                        <Text style={styles.completeBadgeText}>VISIT COMPLETED</Text>
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })
                    )}
                </ScrollView>
            </View>

            {/* Photo Preview Modal */}
            <Modal
                visible={!!selectedPhoto}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedPhoto(null)}
            >
                <TouchableOpacity 
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setSelectedPhoto(null)}
                >
                    <View style={styles.modalContent}>
                        <TouchableOpacity style={styles.closeModal} onPress={() => setSelectedPhoto(null)}>
                            <Ionicons name="close-circle" size={40} color="#fff" />
                        </TouchableOpacity>
                        {selectedPhoto && (
                            <Image 
                                source={{ uri: selectedPhoto }} 
                                style={styles.fullPhoto} 
                                resizeMode="contain" 
                            />
                        )}
                        <Text style={styles.modalHint}>Tap anywhere to close</Text>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 1 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
    dashLogo: {
        width: 60,
        height: 30,
        borderRadius: 6,
        backgroundColor: '#ffffff',
        padding: 2,
    },
    mobileMenuBtn: { backgroundColor: '#ffffff', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    pendingBell: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1b264a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 6 },
    pendingBellText: { color: '#ffc61c', fontWeight: 'bold', fontSize: 12 },
    
    // Stats Header
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    statCard: { flex: 1, backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
    statCardActive: { borderColor: '#1b264a', backgroundColor: '#1b264a10' },
    statLabel: { fontSize: 9, fontWeight: 'bold', color: '#64748b', marginBottom: 4 },
    statValue: { fontSize: 18, fontWeight: 'bold', color: '#1b264a' },

    // Filters
    filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
    filterPillActive: { backgroundColor: '#1b264a', borderColor: '#1b264a' },
    filterPillText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
    filterPillTextActive: { color: '#ffc61c' },

    // Card Records
    recordItem: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10 },
    recordItemWaiting: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
    recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', paddingHorizontal: 15, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgePresent: { backgroundColor: '#10b981' },
    badgeLeave: { backgroundColor: '#f59e0b' },
    badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
    recordDateText: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
    
    recordContent: { padding: 15 },
    userInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1b264a10', justifyContent: 'center', alignItems: 'center' },
    avatarInitials: { fontSize: 16, fontWeight: 'bold', color: '#1b264a' },
    recordName: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
    recordEmployeeId: { fontSize: 12, color: '#64748b' },
    timeInfo: { alignItems: 'flex-end' },
    timeLabel: { fontSize: 8, fontWeight: 'bold', color: '#94a3b8' },
    timeValue: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },

    reasonBlock: { backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#f1f5f9' },
    reasonLabel: { fontSize: 10, fontWeight: 'bold', color: '#1b264a', marginBottom: 2 },
    reasonValue: { fontSize: 12, color: '#475569', lineHeight: 16 },

    evidenceGrid: { flexDirection: 'row', gap: 12 },
    evidencePhotoCard: { width: 100, height: 100, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
    evidenceImage: { width: '100%', height: '100%' },
    evidenceOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 4, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
    evidenceOverlayText: { color: '#fff', fontSize: 8, fontWeight: 'bold' },

    locationCol: { flex: 1, gap: 8 },
    miniMapContainer: { width: '100%', height: 120, borderRadius: 10, overflow: 'hidden', marginBottom: 4, borderWidth: 1, borderColor: '#e2e8f0' },
    locationLink: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eff6ff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#dbeafe' },
    locationLinkText: { fontSize: 11, fontWeight: '700', color: '#1e40af', flex: 1 },
    checkoutBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
    checkoutBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#10b981' },

    recordFooter: { padding: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fafafa' },
    actionGroup: { flexDirection: 'row', gap: 10 },
    footerActionBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flex: 1 },
    
    statusFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    finalStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    finalApproved: { backgroundColor: '#dcfce7' },
    finalRejected: { backgroundColor: '#fee2e2' },
    finalStatusText: { fontSize: 11, fontWeight: 'bold' },
    
    finalCloseBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1b264a', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
    finalCloseBtnText: { color: '#ffc61c', fontSize: 10, fontWeight: 'bold' },
    completeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.7 },
    completeBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#64748b' },

    emptyContainer: { alignItems: 'center', marginTop: 60, gap: 15 },
    emptyText: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },

    // Tab Switcher
    tabContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 4, marginBottom: 20 },
    tabButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, gap: 8 },
    tabButtonActive: { backgroundColor: '#1b264a' },
    tabButtonText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    tabButtonTextActive: { color: '#ffffff' },
    leaveBadgeCount: { backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
    leaveBadgeCountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '95%', height: '85%' },
    fullPhoto: { width: '100%', height: '100%' },
    closeModal: { position: 'absolute', top: -50, right: 0, zIndex: 10 },
    modalHint: { color: '#94a3b8', textAlign: 'center', marginTop: 20, fontSize: 12 }
});

export default AdminAttendanceScreen;
