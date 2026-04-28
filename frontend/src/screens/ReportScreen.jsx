import React, { useState, useEffect, useRef, useContext } from 'react';
import { 
    View, 
    Text, 
    ScrollView, 
    ActivityIndicator, 
    Platform, 
    TouchableOpacity, 
    Animated, 
    StyleSheet,
    Dimensions,
    BackHandler
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from 'twrnc';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { AuthContext } from '../context/AuthContext';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const DonutChart = ({ stats, size = 220 }) => {
    const total = stats.totalRequests || 0;
    const radius = size * 0.35;
    const strokeWidth = size * 0.12;
    const circumference = 2 * Math.PI * radius;
    
    const animatedValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(animatedValue, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: Platform.OS === 'web' ? false : true,
        }).start();
    }, [stats]);

    if (total === 0) return (
        <View style={styles.chartEmpty}>
            <Text allowFontScaling={false} style={styles.chartEmptyText}>No data available</Text>
        </View>
    );

    const approvedPct = stats.approved / total;
    const rejectedPct = stats.rejected / total;
    const pendingPct = stats.pending / total;

    return (
        <View style={styles.chartContainer}>
            <View style={{ width: size + 40, height: size + 40, justifyContent: 'center', alignItems: 'center' }}>
                <Svg width={size + 40} height={size + 40} viewBox={`0 0 ${size + 40} ${size + 40}`}>
                    <G rotation="-90" originX={(size + 40) / 2} originY={(size + 40) / 2}>
                        <Circle
                            cx={(size+40)/2} cy={(size+40)/2} r={radius}
                            stroke="#f8fafc" strokeWidth={strokeWidth}
                            fill="none"
                        />
                        <AnimatedCircle
                            cx={(size+40)/2} cy={(size+40)/2} r={radius}
                            stroke="#e11d48" strokeWidth={strokeWidth}
                            strokeDasharray={circumference}
                            strokeDashoffset={animatedValue.interpolate({
                                inputRange: [0, 1],
                                outputRange: [circumference, circumference - (circumference * (rejectedPct + approvedPct + pendingPct))]
                            })}
                            strokeLinecap="round"
                            fill="none"
                        />
                        <AnimatedCircle
                            cx={(size+40)/2} cy={(size+40)/2} r={radius}
                            stroke="#f59e0b" strokeWidth={strokeWidth}
                            strokeDasharray={circumference}
                            strokeDashoffset={animatedValue.interpolate({
                                inputRange: [0, 1],
                                outputRange: [circumference, circumference - (circumference * (approvedPct + pendingPct))]
                            })}
                            strokeLinecap="round"
                            fill="none"
                        />
                        <AnimatedCircle
                            cx={(size+40)/2} cy={(size+40)/2} r={radius}
                            stroke="#10b981" strokeWidth={strokeWidth}
                            strokeDasharray={circumference}
                            strokeDashoffset={animatedValue.interpolate({
                                inputRange: [0, 1],
                                outputRange: [circumference, circumference - (circumference * approvedPct)]
                            })}
                            strokeLinecap="round"
                            fill="none"
                        />
                    </G>
                    <SvgText
                        x={(size+40)/2} y={(size+40)/2 - 5}
                        textAnchor="middle" fontSize={size*0.18} fontWeight="900"
                        fill="#1e293b"
                    >{total}</SvgText>
                    <SvgText
                        x={(size+40)/2} y={(size+40)/2 + 20}
                        textAnchor="middle" fontSize={size*0.045} fontWeight="700"
                        fill="#94a3b8" letterSpacing={1}
                    >TOTAL</SvgText>
                </Svg>
            </View>

            <View style={styles.legendContainer}>
                <View style={styles.legendGrid}>
                    <View style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                        <Text allowFontScaling={false} style={styles.legendText}>Appr: {stats.approved}</Text>
                    </View>
                    <View style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
                        <Text allowFontScaling={false} style={styles.legendText}>Pend: {stats.pending}</Text>
                    </View>
                    <View style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: '#4f46e5' }]} />
                        <Text allowFontScaling={false} style={styles.legendText}>Picked: {stats.pickedUp}</Text>
                    </View>
                    <View style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: '#059669' }]} />
                        <Text allowFontScaling={false} style={styles.legendText}>Closed: {stats.closed}</Text>
                    </View>
                    <View style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: '#e11d48' }]} />
                        <Text allowFontScaling={false} style={styles.legendText}>Rej/Pen: {stats.rejected + stats.penalized}</Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

const ReportScreen = ({ navigation }) => {
    const { user, logout } = useContext(AuthContext);
    const { width } = useWindowDimensions();
    const isMobile = width < 768;
    const sidebarWidth = Platform.OS === 'web' ? Math.min(280, width * 0.85) : 280;
    const sidebarVisible = Platform.OS === 'web' && !isMobile;
    const sidebarAnim = useRef(new Animated.Value(sidebarVisible ? 0 : -sidebarWidth)).current;

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
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('OVERVIEW');
    
    const toggleSidebar = () => {
        const toValue = isSidebarOpen ? -sidebarWidth : 0;
        Animated.spring(sidebarAnim, {
            toValue,
            useNativeDriver: true,
            bounciness: 0
        }).start();
        setIsSidebarOpen(!isSidebarOpen);
    };

    const [stats, setStats] = useState({
        totalRequests: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        itemCounts: {},
        topMaterial: { name: 'N/A', count: 0 }
    });

    useEffect(() => {
        fetchReports();
    }, []);

    const fetchReports = async () => {
        try {
            const res = await api.get('/requests/reports');
            const data = res.data;
            
            const counts = {};
            data.forEach(req => {
                const name = req.materialName || 'Unknown';
                counts[name] = (counts[name] || 0) + 1;
            });

            const sortedItems = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const topMaterial = sortedItems.length > 0 ? { name: sortedItems[0][0], count: sortedItems[0][1] } : { name: 'N/A', count: 0 };

            setStats({
                totalRequests: data.length,
                approved: data.filter(r => r.status === 'Approved').length,
                rejected: data.filter(r => r.status === 'Rejected').length,
                pending: data.filter(r => r.status === 'Pending').length,
                pickedUp: data.filter(r => r.status === 'PendingReturn').length,
                closed: data.filter(r => r.status === 'Closed').length,
                penalized: data.filter(r => r.status === 'Penalized').length,
                itemCounts: counts,
                topMaterial
            });
            setLoading(false);
        } catch (err) {
            console.log('Error fetching stats');
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4f46e5" />
            </View>
        );
    }

    const sortedAllItems = Object.entries(stats.itemCounts).sort((a, b) => b[1] - a[1]);

    return (
        <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: isMobile ? 'column' : 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
            <Sidebar 
                user={user} 
                navigation={navigation} 
                logout={logout} 
                sidebarAnim={sidebarAnim} 
                toggleSidebar={toggleSidebar} 
                activeScreen="Reports" 
            />
            {isSidebarOpen && (Platform.OS !== 'web' || isMobile) && (
                <TouchableOpacity 
                    activeOpacity={1} 
                    onPress={toggleSidebar} 
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 90 }]} 
                />
            )}
            <View style={{ flex: 1, height: Platform.OS === 'web' ? '100vh' : 'auto' }}>
                <ScrollView 
                    style={{ flex: 1, ...(Platform.OS === 'web' ? { height: '100vh', overflow: 'auto' } : {}) }}
                    contentContainerStyle={{ paddingBottom: 100 }}
                >
                    <View style={styles.paddingContainer}>
                        <View style={styles.header}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                {(Platform.OS !== 'web' || isMobile) && (
                                    <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                                        <Ionicons name="menu" size={24} color="#1b264a" />
                                    </TouchableOpacity>
                                )}
                                <View>
                                    <Text allowFontScaling={false} style={styles.headerLabel}>ANALYTICS ENGINE</Text>
                                    <Text allowFontScaling={false} style={styles.headerTitle}>System Reports</Text>
                                </View>
                            </View>
                            <View style={styles.headerActions}>
                                <TouchableOpacity onPress={fetchReports} style={styles.syncBtn}>
                                    <Text allowFontScaling={false} style={styles.syncBtnText}>REFRESH</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Partition Tabs */}
                        <View style={styles.tabBar}>
                            <TouchableOpacity 
                                style={[styles.tabItem, activeTab === 'OVERVIEW' && styles.tabItemActive]}
                                onPress={() => setActiveTab('OVERVIEW')}
                            >
                                <Ionicons name="bar-chart" size={16} color={activeTab === 'OVERVIEW' ? '#ffffff' : '#94a3b8'} style={{ marginRight: 8 }} />
                                <Text style={[styles.tabText, activeTab === 'OVERVIEW' && styles.tabTextActive]}>OVERVIEW</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.tabItem, activeTab === 'BREAKDOWN' && styles.tabItemActive]}
                                onPress={() => setActiveTab('BREAKDOWN')}
                            >
                                <Ionicons name="cube" size={16} color={activeTab === 'BREAKDOWN' ? '#ffffff' : '#94a3b8'} style={{ marginRight: 8 }} />
                                <Text style={[styles.tabText, activeTab === 'BREAKDOWN' && styles.tabTextActive]}>BREAKDOWN</Text>
                            </TouchableOpacity>
                        </View>
            
                        {activeTab === 'OVERVIEW' ? (
                            <>
                                <View style={styles.topHighlights}>
                                    <View style={styles.highlightCard}>
                                        <Text allowFontScaling={false} style={styles.highlightLabel}>MOST REQUESTED</Text>
                                        <Text allowFontScaling={false} style={styles.highlightValue}>{stats.topMaterial.name}</Text>
                                        <Text allowFontScaling={false} style={styles.highlightMeta}>{stats.topMaterial.count} total requests</Text>
                                    </View>
                                    <View style={[styles.highlightCard, { backgroundColor: '#1b264a' }]}>
                                        <Text allowFontScaling={false} style={[styles.highlightLabel, { color: '#ffc61c' }]}>SUCCESS RATE</Text>
                                        <Text allowFontScaling={false} style={[styles.highlightValue, { color: '#ffffff' }]}>
                                            {stats.totalRequests > 0 ? Math.round((stats.approved / stats.totalRequests) * 100) : 0}%
                                        </Text>
                                        <Text allowFontScaling={false} style={[styles.highlightMeta, { color: '#ffc61c' }]}>approval ratio</Text>
                                    </View>
                                </View>
                    
                                <View style={styles.metricsCard}>
                                    <View style={styles.metricsContent}>
                                        <View style={[styles.metricsStats, Platform.OS === 'web' ? styles.metricsStatsWeb : styles.metricsStatsMobile]}>
                                            <Text allowFontScaling={false} style={styles.sectionTitle}>Status Metrics</Text>
                                            <Text allowFontScaling={false} style={styles.sectionSubtitle}>Analysis based on current request life-cycle.</Text>
        
                                            <View style={styles.metricsGrid}>
                                                <View style={[styles.metricBox, { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' }]}>
                                                    <Text allowFontScaling={false} style={[styles.metricValue, { color: '#059669' }]}>{stats.approved}</Text>
                                                    <Text allowFontScaling={false} style={[styles.metricLabel, { color: '#10b981' }]}>APPROVED</Text>
                                                </View>
                                                <View style={[styles.metricBox, { backgroundColor: '#fffbeb', borderColor: '#fef3c7' }]}>
                                                    <Text allowFontScaling={false} style={[styles.metricValue, { color: '#d97706' }]}>{stats.pending}</Text>
                                                    <Text allowFontScaling={false} style={[styles.metricLabel, { color: '#f59e0b' }]}>PENDING</Text>
                                                </View>
                                                <View style={[styles.metricBox, { backgroundColor: '#fff1f2', borderColor: '#ffe4e6' }]}>
                                                    <Text allowFontScaling={false} style={[styles.metricValue, { color: '#e11d48' }]}>{stats.rejected}</Text>
                                                    <Text allowFontScaling={false} style={[styles.metricLabel, { color: '#f43f5e' }]}>REJECTED</Text>
                                                </View>
                                                <View style={[styles.metricBox, { backgroundColor: '#eef2ff', borderColor: '#e0e7ff' }]}>
                                                    <Text allowFontScaling={false} style={[styles.metricValue, { color: '#4f46e5' }]}>{stats.totalRequests}</Text>
                                                    <Text allowFontScaling={false} style={[styles.metricLabel, { color: '#6366f1' }]}>TOTAL</Text>
                                                </View>
                                            </View>
                                        </View>
        
                                        <View style={[styles.chartWrapper, Platform.OS === 'web' ? (isMobile ? styles.chartWrapperMobile : styles.chartWrapperWeb) : styles.chartWrapperMobile]}>
                                            <DonutChart stats={stats} />
                                        </View>
                                    </View>
                                </View>
                            </>
                        ) : (
                            <View style={styles.breakdownCard}>
                                <View style={styles.breakdownHeader}>
                                    <Text allowFontScaling={false} style={styles.breakdownTitle}>Material Breakdown</Text>
                                    <View style={styles.productBadge}>
                                        <Text allowFontScaling={false} style={styles.productBadgeText}>{sortedAllItems.length} PRODUCTS</Text>
                                    </View>
                                </View>

                                {sortedAllItems.length > 0 ? (
                                    <View style={styles.gridContainer}>
                                        {sortedAllItems.map(([name, count], index) => {
                                            const score = stats.totalRequests > 0 ? (count / stats.totalRequests) * 100 : 0;
                                            return (
                                                <View key={name} style={styles.breakdownGridCard}>
                                                    <View style={styles.breakdownHeaderSmall}>
                                                        <View style={styles.indexCircle}>
                                                            <Text style={styles.indexTextSmall}>{index + 1}</Text>
                                                        </View>
                                                        <Text allowFontScaling={false} numberOfLines={1} style={styles.breakdownGridName}>{name}</Text>
                                                    </View>
                                                    <View style={styles.countGridBox}>
                                                        <Text style={styles.countGridValue}>{count}</Text>
                                                        <Text style={styles.countGridLabel}>REQS</Text>
                                                    </View>
                                                    <View style={styles.progressBarGridBg}>
                                                        <View style={[styles.progressBarGridFill, { width: `${score}%` }]} />
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ) : (
                                    <View style={styles.emptyBox}>
                                        <Text allowFontScaling={false} style={styles.emptyText}>No data in current cycle</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                </ScrollView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: Platform.OS === 'web' ? 0 : 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  paddingContainer: {
    padding: Platform.OS === 'web' ? 24 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 32 : 14,
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: Platform.OS === 'web' ? 24 : 19,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  mobileMenuBtn: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  syncBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  syncBtnText: {
    color: '#1b264a',
    fontSize: 10,
    fontWeight: '800',
  },
  metricsCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 10px rgba(0,0,0,0.05)' } : {}),
  },
  topHighlights: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  highlightCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 2,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 8px rgba(0,0,0,0.03)' } : {}),
  },
  highlightLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    marginBottom: 8,
    letterSpacing: 1,
  },
  highlightValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  highlightMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  metricsContent: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
  },
  metricsStats: {
    flex: 1,
  },
  metricsStatsWeb: {
    paddingRight: 32,
    borderRightWidth: 1,
    borderRightColor: '#f8fafc',
  },
  metricsStatsMobile: {
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
    marginBottom: 32,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricBox: {
    width: '47%',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
  chartWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartContainer: {
    alignItems: 'center',
    width: '100%',
  },
  legendContainer: {
    width: '100%',
    paddingHorizontal: 10,
    marginTop: 20,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  legendText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  chartEmpty: {
    padding: 40,
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  chartEmptyText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    padding: 6,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: '#1b264a',
    elevation: 4,
    shadowColor: '#1b264a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 8px rgba(27,38,74,0.3)' } : {}),
  },
  tabText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  tabTextActive: {
    color: '#ffffff',
  },
  breakdownCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 10px rgba(0,0,0,0.05)' } : {}),
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  breakdownTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  productBadge: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  productBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  indexBox: {
    width: 40,
    height: 40,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    color: '#64748b',
    fontWeight: 'bold',
    fontSize: 14,
  },
  breakdownContent: {
    flex: 1,
    marginHorizontal: 16,
  },
  breakdownName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    width: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffc61c',
    borderRadius: 4,
  },
  countInfo: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  countText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#4f46e5',
  },
  countLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#94a3b8',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  breakdownGridCard: {
    width: Platform.OS === 'web' ? (isMobile ? '48%' : '23%') : '48%',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'space-between',
  },
  breakdownHeaderSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  indexCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1b264a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexTextSmall: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  breakdownGridName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1,
  },
  countGridBox: {
    alignItems: 'center',
    marginBottom: 8,
  },
  countGridValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#4f46e5',
  },
  countGridLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#94a3b8',
  },
  progressBarGridBg: {
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarGridFill: {
    height: '100%',
    backgroundColor: '#ffc61c',
  },
  emptyBox: {
    padding: 60,
    alignItems: 'center',
    width: '100%',
  },
  emptyText: {
    color: '#cbd5e1',
    fontWeight: 'bold',
    fontStyle: 'italic',
  },
});

export default ReportScreen;
