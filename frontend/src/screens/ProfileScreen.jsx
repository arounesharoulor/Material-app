import React, { useContext, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity, Animated, Image, TextInput, ActivityIndicator, Modal, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import api, { BASE_URL } from '../services/api';
import Toast from 'react-native-toast-message';

const ProfileScreen = ({ navigation }) => {
    const { user, logout, updateUserState } = useContext(AuthContext);
    const [sidebarVisible, setSidebarVisible] = useState(Platform.OS === 'web');
    const sidebarAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : -280)).current;

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

    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState(user?.name || '');
    const [employeeId, setEmployeeId] = useState(user?.employeeId || '');
    const [email, setEmail] = useState(user?.email || '');
    const [profilePhoto, setProfilePhoto] = useState(null);
    const [removePhotoSelected, setRemovePhotoSelected] = useState(false);
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otp, setOtp] = useState('');
    const [verifyingOtp, setVerifyingOtp] = useState(false);
    const [pendingEmail, setPendingEmail] = useState('');

    const fileInputRef = useRef(null);

    const toggleSidebar = () => {
        const toValue = sidebarVisible ? -280 : 0;
        Animated.timing(sidebarAnim, { toValue, duration: 300, useNativeDriver: false }).start();
        setSidebarVisible(!sidebarVisible);
    };

    const handleWebFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setProfilePhoto({ uri: event.target.result, name: file.name, type: file.type, file });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleImagePick = async () => {
        if (Platform.OS === 'web') {
            if (fileInputRef.current) { fileInputRef.current.click(); return; }
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Camera access is required' });
            return;
        }
        const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
        if (!result.canceled) setProfilePhoto(result.assets[0]);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('name', name);
            if (user?.role === 'Employee') formData.append('employeeId', employeeId);
            formData.append('email', email);
            if (removePhotoSelected) {
                formData.append('removePhoto', 'true');
            } else if (profilePhoto) {
                if (Platform.OS === 'web') {
                    if (profilePhoto.file) {
                        formData.append('profilePicture', profilePhoto.file, profilePhoto.name || 'profile.jpg');
                    } else {
                        const response = await fetch(profilePhoto.uri);
                        const blob = await response.blob();
                        formData.append('profilePicture', blob, 'profile.jpg');
                    }
                } else {
                    const localUri = profilePhoto.uri;
                    const filename = localUri.split('/').pop();
                    const match = /\.(\w+)$/.exec(filename);
                    const type = match ? `image/${match[1]}` : 'image';
                    formData.append('profilePicture', { uri: localUri, name: filename, type });
                }
            }
            const res = await api.put('/auth/profile', formData);
            if (res.data.emailChanged) {
                setPendingEmail(email);
                await api.post('/otp/send-otp', { email: email.trim() });
                setShowOtpModal(true);
                Toast.show({ type: 'info', text1: 'Verification Needed', text2: 'Please verify your new email' });
            } else {
                updateUserState(res.data.user);
                setIsEditing(false);
                setRemovePhotoSelected(false);
                Toast.show({ type: 'success', text1: 'Success', text2: 'Profile updated successfully' });
            }
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Update Failed', text2: err.response?.data?.msg || 'Could not update profile' });
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        setVerifyingOtp(true);
        try {
            await api.post('/otp/verify-otp', { email: pendingEmail, otp });
            const res = await api.put('/auth/finalize-email', { email: pendingEmail });
            updateUserState({ ...user, email: pendingEmail });
            setShowOtpModal(false);
            setIsEditing(false);
            setRemovePhotoSelected(false);
            setOtp('');
            Toast.show({ type: 'success', text1: 'Verified', text2: 'Email updated successfully' });
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Invalid Code', text2: 'The verification code is incorrect' });
        } finally {
            setVerifyingOtp(false);
        }
    };

    const getProfileImage = () => {
        if (removePhotoSelected) return null;
        if (profilePhoto) return { uri: profilePhoto.uri };
        if (user?.profilePicture) return { uri: `${BASE_URL}/${user.profilePicture.replace(/\\/g, '/')}` };
        return null;
    };

    const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

    const InfoCard = ({ icon, label, value, fieldName, editable = true, iconColor = '#4f46e5', bgColor = '#eef2ff' }) => (
        <View style={styles.infoCard}>
            <View style={[styles.infoCardIcon, { backgroundColor: bgColor }]}>
                <Ionicons name={icon} size={20} color={iconColor} />
            </View>
            <Text allowFontScaling={false} style={styles.infoCardLabel}>{label}</Text>
            {isEditing && editable ? (
                <TextInput
                    style={styles.infoCardInput}
                    value={fieldName === 'name' ? name : fieldName === 'email' ? email : employeeId}
                    onChangeText={(val) => {
                        if (fieldName === 'name') setName(val);
                        if (fieldName === 'email') setEmail(val);
                        if (fieldName === 'employeeId') setEmployeeId(val);
                    }}
                    autoCapitalize={fieldName === 'email' ? 'none' : 'words'}
                    nativeID={`profile-${fieldName}`}
                />
            ) : (
                <Text allowFontScaling={false} style={styles.infoCardValue} numberOfLines={1}>{value}</Text>
            )}
        </View>
    );

    return (
        <View style={styles.container}>
            {Platform.OS === 'web' && (
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleWebFileSelect} />
            )}
            <Sidebar user={user} navigation={navigation} logout={logout} sidebarAnim={sidebarAnim} toggleSidebar={toggleSidebar} activeScreen="Profile" />

            <View style={styles.mainContent}>
                <ScrollView
                    style={{ flex: 1, ...(Platform.OS === 'web' ? { height: '100vh', overflow: 'auto' } : {}) }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Page Header ── */}
                    <View style={styles.pageHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {Platform.OS !== 'web' && (
                                <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                                    <Ionicons name="menu" size={22} color="#1b264a" />
                                </TouchableOpacity>
                            )}
                            <View>
                                <Text allowFontScaling={false} style={styles.pageLabel}>USER IDENTITY</Text>
                                <Text allowFontScaling={false} style={styles.pageTitle}>My Profile</Text>
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            {isEditing && (
                                <TouchableOpacity 
                                    onPress={() => { 
                                        setIsEditing(false); 
                                        setRemovePhotoSelected(false); 
                                        setProfilePhoto(null); 
                                        setName(user?.name || ''); 
                                        setEmail(user?.email || ''); 
                                        setEmployeeId(user?.employeeId || ''); 
                                    }} 
                                    style={styles.cancelBtn}
                                >
                                    <Text allowFontScaling={false} style={styles.cancelBtnText}>CANCEL</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                onPress={() => isEditing ? handleSave() : setIsEditing(true)}
                                style={[styles.editBtn, isEditing && styles.editBtnSave]}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                    <>
                                        <Ionicons name={isEditing ? 'checkmark-done' : 'create-outline'} size={14} color="#ffffff" />
                                        <Text allowFontScaling={false} style={styles.editBtnText}>
                                            {isEditing ? 'SAVE' : 'EDIT'}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ── Hero Banner ── */}
                    <View style={styles.heroBanner}>
                        <View style={styles.heroBannerStripe} />
                        <View style={styles.heroContent}>
                            {/* Avatar */}
                            <View style={styles.avatarWrapper}>
                                <TouchableOpacity
                                    onPress={isEditing ? handleImagePick : null}
                                    activeOpacity={isEditing ? 0.7 : 1}
                                >
                                    <View style={styles.avatar}>
                                        {getProfileImage() ? (
                                            <Image source={getProfileImage()} style={styles.avatarImg} />
                                        ) : (
                                            <Text allowFontScaling={false} style={styles.avatarText}>{initials}</Text>
                                        )}
                                        {isEditing && (
                                            <View style={styles.avatarOverlay}>
                                                <Ionicons name="camera" size={22} color="#ffffff" />
                                            </View>
                                        )}
                                    </View>
                                    {isEditing && (
                                        <View style={styles.editPhotoHint}>
                                            <Text allowFontScaling={false} style={styles.editPhotoHintText}>CHANGE</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>

                                {isEditing && getProfileImage() && (
                                    <TouchableOpacity 
                                        style={styles.removePhotoBtn}
                                        onPress={() => {
                                            setRemovePhotoSelected(true);
                                            setProfilePhoto(null);
                                        }}
                                    >
                                        <Ionicons name="trash" size={14} color="#ffffff" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Identity block */}
                            <View style={styles.heroIdentity}>
                                <Text allowFontScaling={false} style={styles.heroName}>{user?.name}</Text>
                                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                    <View style={styles.heroBadge}>
                                        <Ionicons name="shield-checkmark" size={10} color="#4f46e5" style={{ marginRight: 4 }} />
                                        <Text allowFontScaling={false} style={styles.heroBadgeText}>{user?.role?.toUpperCase()}</Text>
                                    </View>
                                    {user?.employeeId && (
                                        <View style={[styles.heroBadge, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                                            <Ionicons name="id-card" size={10} color="#d97706" style={{ marginRight: 4 }} />
                                            <Text allowFontScaling={false} style={[styles.heroBadgeText, { color: '#d97706' }]}>{user.employeeId}</Text>
                                        </View>
                                    )}
                                </View>
                                <Text allowFontScaling={false} style={styles.heroEmail}>{user?.email}</Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Info Grid ── */}
                    <Text allowFontScaling={false} style={styles.sectionLabel}>ACCOUNT DETAILS</Text>
                    <View style={styles.infoGrid}>
                        <InfoCard
                            icon="person-outline"
                            label="FULL NAME"
                            value={user?.name}
                            fieldName="name"
                            iconColor="#4f46e5"
                            bgColor="#eef2ff"
                        />
                        <InfoCard
                            icon="mail-outline"
                            label="WORK EMAIL"
                            value={user?.email}
                            fieldName="email"
                            iconColor="#0891b2"
                            bgColor="#ecfeff"
                        />
                        {user?.role === 'Employee' && (
                            <InfoCard
                                icon="id-card-outline"
                                label="EMPLOYEE ID"
                                value={user?.employeeId || 'Not Set'}
                                fieldName="employeeId"
                                iconColor="#d97706"
                                bgColor="#fffbeb"
                            />
                        )}
                        <InfoCard
                            icon="shield-checkmark-outline"
                            label="ACCOUNT ROLE"
                            value={user?.role}
                            fieldName="role"
                            editable={false}
                            iconColor="#059669"
                            bgColor="#ecfdf5"
                        />
                    </View>

                    {/* ── Actions Row ── */}
                    {!isEditing && (
                        <View style={styles.actionsRow}>
                            <TouchableOpacity style={styles.actionCard} onPress={logout}>
                                <View style={[styles.actionCardIcon, { backgroundColor: '#fff1f2' }]}>
                                    <Ionicons name="log-out-outline" size={22} color="#e11d48" />
                                </View>
                                <Text allowFontScaling={false} style={[styles.actionCardText, { color: '#e11d48' }]}>LOGOUT</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </View>

            {/* OTP Verification Modal */}
            <Modal visible={showOtpModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Ionicons name="mail-unread" size={48} color="#1b264a" style={{ marginBottom: 16 }} />
                        <Text allowFontScaling={false} style={styles.modalTitle}>Verify Email Change</Text>
                        <Text allowFontScaling={false} style={styles.modalSubtitle}>We sent a verification code to {pendingEmail}</Text>
                        <TextInput
                            style={styles.otpInput}
                            placeholder="6-Digit Code"
                            keyboardType="numeric"
                            maxLength={6}
                            value={otp}
                            onChangeText={setOtp}
                            nativeID="profile-otp"
                        />
                        <TouchableOpacity style={styles.verifyButton} onPress={handleVerifyOtp} disabled={verifyingOtp}>
                            {verifyingOtp ? <ActivityIndicator color="#ffffff" /> : (
                                <Text allowFontScaling={false} style={styles.verifyButtonText}>VERIFY & UPDATE</Text>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowOtpModal(false)}>
                            <Text allowFontScaling={false} style={styles.modalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
                        
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        backgroundColor: '#f1f5f9',
    },
    mainContent: {
        flex: 1,
        height: Platform.OS === 'web' ? '100vh' : '100%',
    },
    scrollContent: {
        padding: Platform.OS === 'web' ? 32 : 16,
        paddingBottom: 60,
    },
    // ── Header
    pageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    pageLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 1,
    },
    pageTitle: {
        fontSize: Platform.OS === 'web' ? 26 : 20,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    mobileMenuBtn: {
        backgroundColor: '#ffffff',
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#1b264a',
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 14,
    },
    editBtnSave: {
        backgroundColor: '#10b981',
    },
    editBtnText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    cancelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    cancelBtnText: {
        color: '#64748b',
        fontSize: 11,
        fontWeight: '800',
    },
    // ── Hero Banner
    heroBanner: {
        backgroundColor: '#1b264a',
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 24,
        ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(27,38,74,0.2)' } : { elevation: 6 }),
    },
    heroBannerStripe: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: '#ffc61c',
    },
    heroContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        padding: Platform.OS === 'web' ? 28 : 20,
        flexWrap: 'wrap',
    },
    avatarWrapper: { position: 'relative' },
    avatar: {
        width: Platform.OS === 'web' ? 96 : 80,
        height: Platform.OS === 'web' ? 96 : 80,
        borderRadius: Platform.OS === 'web' ? 48 : 40,
        backgroundColor: '#ffc61c',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.2)',
        overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarText: { fontSize: Platform.OS === 'web' ? 36 : 30, fontWeight: '900', color: '#1b264a' },
    avatarOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    editPhotoHint: {
        position: 'absolute',
        bottom: -8,
        alignSelf: 'center',
        backgroundColor: '#ffc61c',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    editPhotoHintText: { fontSize: 7, fontWeight: '900', color: '#1b264a' },
    removePhotoBtn: {
        position: 'absolute',
        top: 0,
        right: -8,
        backgroundColor: '#e11d48',
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#1b264a',
    },
    heroIdentity: { flex: 1, minWidth: 160 },
    heroName: {
        fontSize: Platform.OS === 'web' ? 22 : 18,
        fontWeight: '900',
        color: '#ffffff',
    },
    heroBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#eef2ff',
        borderWidth: 1,
        borderColor: '#c7d2fe',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    heroBadgeText: {
        fontSize: 9,
        fontWeight: '900',
        color: '#4f46e5',
    },
    heroEmail: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 8,
    },
    // ── Info Grid
    sectionLabel: {
        fontSize: 10,
        fontWeight: '900',
        color: '#64748b',
        letterSpacing: 1.5,
        marginBottom: 14,
    },
    infoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24,
    },
    infoCard: {
        width: Platform.OS === 'web' ? 'calc(50% - 6px)' : '48%',
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: Platform.OS === 'web' ? 20 : 14,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.04)' } : { elevation: 2 }),
        minWidth: 140,
        flex: 1,
    },
    infoCardIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    infoCardLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: '#94a3b8',
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    infoCardValue: {
        fontSize: Platform.OS === 'web' ? 15 : 13,
        fontWeight: '700',
        color: '#1e293b',
    },
    infoCardInput: {
        fontSize: Platform.OS === 'web' ? 15 : 13,
        fontWeight: '700',
        color: '#1b264a',
        borderBottomWidth: 2,
        borderBottomColor: '#ffc61c',
        paddingVertical: 4,
        marginTop: 2,
    },
    // ── Actions
    actionsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    actionCard: {
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: '#fecdd3',
        ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.04)', maxWidth: 160, cursor: 'pointer' } : { elevation: 2 }),
    },
    actionCardIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionCardText: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    // ── OTP Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderRadius: 32,
        padding: 30,
        width: '100%',
        maxWidth: 400,
        alignItems: 'center',
    },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#0f172a', marginBottom: 8 },
    modalSubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 24 },
    otpInput: {
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 16,
        padding: 16,
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1b264a',
        textAlign: 'center',
        width: '100%',
        letterSpacing: 8,
        marginBottom: 24,
    },
    verifyButton: {
        backgroundColor: '#1b264a',
        paddingVertical: 18,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        marginBottom: 16,
    },
    verifyButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
    modalCancelText: { color: '#ef4444', fontWeight: '800', fontSize: 12 },
});

export default ProfileScreen;
