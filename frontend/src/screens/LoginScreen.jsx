import React, { useState, useContext, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, Platform, StyleSheet, KeyboardAvoidingView, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from 'twrnc';
import { AuthContext } from '../context/AuthContext';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const { login } = useContext(AuthContext);

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(result);
  };

  useEffect(() => {
    generateCaptcha();
    
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const handleLogin = async () => {
    let newErrors = {};
    if (!email) newErrors.email = 'Email address is required';
    if (!password) newErrors.password = 'Password is required';
    if (!captchaInput) newErrors.captcha = 'Security code is required';
    else if (captchaInput.toUpperCase() !== captchaCode) newErrors.captcha = 'Incorrect security code';

    if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        if (newErrors.captcha) generateCaptcha();
        return;
    }

    try {
      await login(email.trim(), password, captchaInput.trim());
    } catch (err) {
      if (!err.response) {
        setErrors({ auth: 'Connection Error: Backend server is unreachable. Check your IP/Network.' });
      } else {
        setErrors({ auth: err.response.data?.msg || 'Invalid email or password' });
      }
      generateCaptcha();
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
    <View style={[tw`bg-slate-50`, Platform.OS === 'web' ? { height: '100vh' } : tw`flex-1`]}>
        <ScrollView 
          style={{ flex: 1, ...(Platform.OS === 'web' ? { overflow: 'auto' } : {}) }}
          contentContainerStyle={[
            { flexGrow: 1 },
            Platform.OS === 'web' ? { paddingBottom: 0 } : { paddingBottom: 120 }
          ]}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          <View style={Platform.OS === 'web' ? styles.rowWeb : styles.colMobile}>
              {/* Branding Section - Hidden on mobile when keyboard is active */}
              {(!isKeyboardVisible || Platform.OS === 'web') && (
                <View style={[styles.branding, Platform.OS === 'web' ? styles.panelWeb : styles.panelMobile]}>
                    <Text allowFontScaling={false} style={styles.brandingLabel}>ENTERPRISE PORTAL</Text>
                    <Text allowFontScaling={false} style={styles.brandingTitle}>Material Request</Text>
                    <View style={styles.divider} />
                    <Text allowFontScaling={false} style={styles.brandingDesc}>
                        Secure inventory tracking and request management system.
                    </Text>
                </View>
              )}
  
              {/* Login Form Section */}
              <View style={[styles.formSection, Platform.OS === 'web' ? styles.panelWeb : styles.panelMobile]}>
                  <View style={styles.formContent}>
                      <View style={styles.headerBox}>
                          <Text allowFontScaling={false} style={styles.headerTitle}>Sign In</Text>
                          <Text allowFontScaling={false} style={styles.headerSubtitle}>Enter credentials to continue</Text>
                      </View>
                      
                      <View style={styles.inputGroup}>
                          <Text allowFontScaling={false} style={styles.inputLabel}>EMAIL ADDRESS</Text>
                          <TextInput 
                              style={[styles.input, errors.email && styles.inputError]}
                              placeholder="name@company.com" 
                              placeholderTextColor="#94a3b8"
                              value={email} 
                              onChangeText={(val) => { setEmail(val); setErrors({ ...errors, email: null, auth: null }); }} 
                              autoCapitalize="none"
                              autoCorrect={false}
                              keyboardType="email-address"
                          />
                          {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
                      </View>
                      
                      <View style={styles.inputGroup}>
                          <Text allowFontScaling={false} style={styles.inputLabel}>PASSWORD</Text>
                          <TextInput 
                              style={[styles.input, errors.password && styles.inputError]}
                              placeholder="••••••••" 
                              placeholderTextColor="#94a3b8"
                              secureTextEntry 
                              value={password} 
                              onChangeText={(val) => { setPassword(val); setErrors({ ...errors, password: null, auth: null }); }} 
                              autoCorrect={false}
                          />
                          {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
                      </View>
                      
                      <View style={styles.inputGroup}>
                          <Text allowFontScaling={false} style={styles.inputLabel}>SECURITY CHECK</Text>
                          <View style={styles.captchaRow}>
                              <View style={styles.captchaBox}>
                                  <Text allowFontScaling={false} style={styles.captchaText}>{captchaCode}</Text>
                              </View>
                               <TouchableOpacity onPress={generateCaptcha} style={styles.refreshBtn}>
                                  <Ionicons name="refresh" size={24} color="#1b264a" />
                               </TouchableOpacity>
                          </View>
                          <TextInput 
                              style={[styles.input, errors.captcha && styles.inputError]}
                              placeholder="Type characters above" 
                              placeholderTextColor="#94a3b8"
                              value={captchaInput} 
                              onChangeText={(val) => { setCaptchaInput(val); setErrors({ ...errors, captcha: null, auth: null }); }} 
                              autoCapitalize="characters"
                              autoCorrect={false}
                          />
                          {errors.captcha ? <Text style={styles.errorText}>{errors.captcha}</Text> : null}
                          {errors.auth ? <Text style={styles.authErrorText}>{errors.auth}</Text> : null}
                      </View>

                      
                      <TouchableOpacity style={styles.submitBtn} onPress={handleLogin} activeOpacity={0.8}>
                          <Text allowFontScaling={false} style={styles.submitBtnText}>SIGN IN</Text>
                      </TouchableOpacity>
  
                       <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkBtn}>
                          <Text allowFontScaling={false} style={styles.linkText}>
                              New to the system? <Text style={{ color: '#4f46e5' }}>Create Account</Text>
                          </Text>
                      </TouchableOpacity>

                  </View>
              </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'web' ? 0 : 40,
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web' ? { overflow: 'auto' } : {}),
  },
  scrollContent: {
    flexGrow: 1,
  },
  rowWeb: {
    flex: 1,
    flexDirection: 'row',
  },
  colMobile: {
    flex: 1,
    flexDirection: 'column',
  },
  panelWeb: {
    width: '50%',
    minHeight: '100%',
  },
  panelMobile: {
    width: '100%',
  },
  branding: {
    backgroundColor: '#1b264a',
    padding: 32,
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? 400 : 200,
  },
  brandingLabel: {
    color: '#ffc61c',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 2,
  },
  brandingTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  divider: {
    height: 4,
    width: 60,
    backgroundColor: '#ffc61c',
    borderRadius: 2,
    marginBottom: 24,
  },
  brandingDesc: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  formSection: {
    backgroundColor: '#ffffff',
    padding: 24,
    justifyContent: 'center',
  },
  formContent: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  headerBox: {
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#0f172a',
  },
  captchaRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  captchaBox: {
    flex: 1,
    backgroundColor: '#1b264a',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    height: 56,
  },
  captchaText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffc61c',
    fontStyle: 'italic',
    letterSpacing: 4,
  },
  refreshBtn: {
    marginLeft: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtn: {
    backgroundColor: '#1b264a',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
    borderBottomWidth: 4,
    borderBottomColor: '#ffc61c',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 8px rgba(0,0,0,0.1)' } : {}),
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  registerBtnText: {
    color: '#007bff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  linkBtn: {
    marginTop: 24,
  },
  linkText: {
    textAlign: 'center',
    color: '#64748b',
    fontWeight: '700',
    fontSize: 14,
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fff1f2',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
    marginLeft: 4,
  },
  authErrorText: {
    color: '#ffffff',
    backgroundColor: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    textAlign: 'center',
    overflow: 'hidden',
  }
});

export default LoginScreen;

