import React, { useContext, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity, Animated, Image, TextInput, ActivityIndicator, Modal, Alert, BackHandler } from 'react-native';
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
    
    // Form States
    const [name, setName] = useState(user?.name || '');
    const [employeeId, setEmployeeId] = useState(user?.employeeId || '');
    const [email, setEmail] = useState(user?.email || '');
    const [profilePhoto, setProfilePhoto] = useState(null);

    // OTP States
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otp, setOtp] = useState('');
    const [verifyingOtp, setVerifyingOtp] = useState(false);
    const [pendingEmail, setPendingEmail] = useState('');

    const toggleSidebar = () => {
        const toValue = sidebarVisible ? -280 : 0;
        Animated.timing(sidebarAnim, {
            toValue,
            duration: 300,
            useNativeDriver: false,
        }).start();
        setSidebarVisible(!sidebarVisible);
    };

    const handleImagePick = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            setProfilePhoto(result.assets[0]);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('name', name);
            if (user?.role === 'Employee') formData.append('employeeId', employeeId);
            formData.append('email', email);

            if (profilePhoto) {
                if (Platform.OS === 'web') {
                    const response = await fetch(profilePhoto.uri);
                    const blob = await response.blob();
                    formData.append('profilePicture', blob, 'profile.jpg');
                } else {
                    const localUri = profilePhoto.uri;
                    const filename = localUri.split('/').pop();
                    const match = /\.(\w+)$/.exec(filename);
                    const type = match ? `image/${match[1]}` : `image`;
                    formData.append('profilePicture', { uri: localUri, name: filename, type });
                }
            }

            const res = await api.put('/auth/profile', formData);

            if (res.data.emailChanged) {
                setPendingEmail(email);
                // Trigger OTP send to new email
                await api.post('/otp/send-otp', { email: email.trim() });
                setShowOtpModal(true);
                Toast.show({ type: 'info', text1: 'Verification Needed', text2: 'Please verify your new email' });
            } else {
                updateUserState(res.data.user);
                setIsEditing(false);
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
            
            // Finalize email update in backend
            const res = await api.put('/auth/finalize-email', { email: pendingEmail });
            
            // Update local user state
            updateUserState({ ...user, email: pendingEmail });
            
            setShowOtpModal(false);
            setIsEditing(false);
            setOtp('');
            Toast.show({ type: 'success', text1: 'Verified', text2: 'Email updated successfully' });
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Invalid Code', text2: 'The verification code is incorrect' });
        } finally {
            setVerifyingOtp(false);
        }
    };

    const getProfileImage = () => {
        if (profilePhoto) return { uri: profilePhoto.uri };
        if (user?.profilePicture) return { uri: `${BASE_URL}/${user.profilePicture.replace(/\\/g, '/')}` };
        return null;
    };

    const renderDetailItem = (label, value, iconName, fieldName, editable = true) => (
        <View style={styles.detailItem}>
            <View style={styles.detailIconContainer}>
                <Ionicons name={iconName} size={20} color="#1b264a" />
            </View>
            <View style={styles.detailTextContainer}>
                <Text style={styles.detailLabel}>{label}</Text>
                {isEditing && editable ? (
                    <TextInput 
                        style={styles.detailInput} 
                        value={fieldName === 'name' ? name : fieldName === 'email' ? email : employeeId}
                        onChangeText={(val) => {
                            if (fieldName === 'name') setName(val);
                            if (fieldName === 'email') setEmail(val);
                            if (fieldName === 'employeeId') setEmployeeId(val);
                        }}
                        autoCapitalize={fieldName === 'email' ? 'none' : 'words'}
                    />
                ) : (
                    <Text style={styles.detailValue}>{value}</Text>
                )}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Sidebar 
                user={user} 
                navigation={navigation} 
                logout={logout} 
                sidebarAnim={sidebarAnim} 
                toggleSidebar={toggleSidebar}
                activeScreen="Profile"
            />
            <View style={styles.mainContent}>
                <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
                    <View style={styles.header}>
                        {/* Top row: menu + title */}
                        <View style={styles.headerTopRow}>
                            {Platform.OS !== 'web' && (
                                <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                                    <Ionicons name="menu" size={22} color="#1b264a" />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => navigation.navigate('Dashboard')} style={styles.backButton}>
                                <Ionicons name="arrow-back" size={22} color="#1b264a" />
                            </TouchableOpacity>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.headerLabel}>USER IDENTITY</Text>
                                <Text style={styles.headerTitle} numberOfLines={1}>Account Settings</Text>
                            </View>
                        </View>

                        {/* Bottom row: action button */}
                        <TouchableOpacity 
                            onPress={() => isEditing ? handleSave() : setIsEditing(true)} 
                            style={[styles.editButton, isEditing && { backgroundColor: '#10b981', borderColor: '#10b981' }]}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <>
                                    <Ionicons name={isEditing ? "checkmark-done" : "create-outline"} size={12} color={isEditing ? "#ffffff" : "#1b264a"} />
                                    <Text style={[styles.editButtonText, isEditing && { color: '#ffffff' }]}>
                                        {isEditing ? 'SAVE CHANGES' : 'EDIT PROFILE'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.profileCard}>
                        <View style={styles.avatarSection}>
                            <TouchableOpacity 
                                onPress={isEditing ? handleImagePick : null}
                                activeOpacity={isEditing ? 0.7 : 1}
                                style={styles.avatarWrapper}
                            >
                                <View style={styles.avatar}>
                                    {getProfileImage() ? (
                                        <Image source={getProfileImage()} style={styles.avatarImg} />
                                    ) : (
                                        <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
                                    )}
                                    {isEditing && (
                                        <View style={styles.avatarOverlay}>
                                            <Ionicons name="camera" size={24} color="#ffffff" />
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                            <Text style={styles.profileName}>{user?.name}</Text>
                            <View style={styles.roleBadge}>
                                <Text style={styles.roleBadgeText}>{user?.role?.toUpperCase()}</Text>
                            </View>
                        </View>

                        <View style={styles.detailsContainer}>
                            {renderDetailItem('FULL NAME', user?.name, 'person-outline', 'name')}
                            {renderDetailItem('WORK EMAIL', user?.email, 'mail-outline', 'email')}
                            {user?.role === 'Employee' && renderDetailItem('EMPLOYEE ID', user?.employeeId || 'NOT SET', 'id-card-outline', 'employeeId')}
                            {renderDetailItem('ACCOUNT ROLE', user?.role, 'shield-checkmark-outline', 'role', false)}
                        </View>

                        {!isEditing && (
                            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                                <Ionicons name="log-out-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                                <Text style={styles.logoutButtonText}>LOGOUT FROM SESSION</Text>
                            </TouchableOpacity>
                        )}
                        {isEditing && (
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)}>
                                <Text style={styles.cancelButtonText}>CANCEL EDITING</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </ScrollView>
            </View>

            {/* OTP Verification Modal */}
            <Modal visible={showOtpModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Ionicons name="mail-unread" size={48} color="#1b264a" style={{ marginBottom: 16 }} />
                        <Text style={styles.modalTitle}>Verify Email Change</Text>
                        <Text style={styles.modalSubtitle}>We sent a verification code to {pendingEmail}</Text>
                        
                        <TextInput 
                            style={styles.otpInput}
                            placeholder="6-Digit Code"
                            keyboardType="numeric"
                            maxLength={6}
                            value={otp}
                            onChangeText={setOtp}
                        />

                        <TouchableOpacity 
                            style={styles.verifyButton} 
                            onPress={handleVerifyOtp}
                            disabled={verifyingOtp}
                        >
                            {verifyingOtp ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text style={styles.verifyButtonText}>VERIFY & UPDATE</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setShowOtpModal(false)}>
                            <Text style={styles.modalCancelText}>Cancel</Text>
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
        backgroundColor: '#f8fafc',
    },
    mainContent: {
        flex: 1,
        height: Platform.OS === 'web' ? '100vh' : '100%',
    },
    contentScroll: {
        flex: 1,
    },
    contentContainer: {
        padding: Platform.OS === 'web' ? 40 : 20,
    },
    header: {
        marginBottom: 24,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    headerLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 1,
    },
    headerTitle: {
        fontSize: Platform.OS === 'web' ? 28 : 22,
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
    backButton: {
        backgroundColor: '#ffffff',
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginLeft: 0,
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 8,
        width: '100%',
    },
    editButtonText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#1b264a',
        letterSpacing: 0.5,
    },
    menuButton: {
        padding: 10,
        backgroundColor: '#ffffff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    profileCard: {
        backgroundColor: '#ffffff',
        borderRadius: 32,
        padding: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.05,
        shadowRadius: 20,
        elevation: 5,
        maxWidth: 600,
        alignSelf: Platform.OS === 'web' ? 'flex-start' : 'stretch',
        width: '100%',
    },
    avatarSection: {
        alignItems: 'center',
        marginBottom: 40,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingBottom: 30,
    },
    avatarWrapper: {
        position: 'relative',
        marginBottom: 16,
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#ffc61c',
        overflow: 'hidden',
    },
    avatarImg: {
        width: '100%',
        height: '100%',
    },
    avatarText: {
        color: '#1b264a',
        fontSize: 48,
        fontWeight: 'bold',
    },
    avatarOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    roleBadge: {
        backgroundColor: '#eef2ff',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        marginTop: 8,
    },
    roleBadgeText: {
        fontSize: 10,
        color: '#4f46e5',
        fontWeight: '900',
        letterSpacing: 1,
    },
    detailsContainer: {
        gap: 20,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    detailIconContainer: {
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    detailTextContainer: {
        flex: 1,
        gap: 2,
    },
    detailLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 0.5,
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1e293b',
    },
    detailInput: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1b264a',
        borderBottomWidth: 1,
        borderBottomColor: '#1b264a',
        paddingVertical: 2,
    },
    logoutButton: {
        marginTop: 30,
        backgroundColor: '#ef4444',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    logoutButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    cancelButton: {
        marginTop: 16,
        paddingVertical: 14,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#64748b',
        fontSize: 12,
        fontWeight: '800',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
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
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#64748b',
        textAlign: 'center',
        marginBottom: 24,
    },
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
    verifyButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '800',
    },
    modalCancelText: {
        color: '#ef4444',
        fontWeight: '800',
        fontSize: 12,
    }
});

export default ProfileScreen;
