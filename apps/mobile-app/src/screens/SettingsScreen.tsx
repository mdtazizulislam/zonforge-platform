import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { clearToken } from '../services/api'
import { useRouter } from 'expo-router'

const C = { bg:'#010a10',surface:'#060f18',card:'#08141f',border:'#0d2035',text:'#7aaec8',light:'#c0daea',white:'#e5f3fb',cyan:'#00d9ff',lime:'#1deb8a',coral:'#ff4d6d' }

const SETTINGS = [
  { label: 'Push Notifications', sub: 'P1/P2 alerts instantly', icon: '🔔', type: 'toggle' },
  { label: 'API Endpoint',        sub: 'api.zonforge.com',       icon: '🌐', type: 'info' },
  { label: 'App Version',         sub: '4.6.0 (build 460)',      icon: '📦', type: 'info' },
  { label: 'Privacy Policy',      sub: 'zonforge.com/privacy',   icon: '🔒', type: 'link' },
]

export default function SettingsScreen() {
  const router = useRouter()
  const logout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await clearToken(); router.replace('/login') } },
    ])
  }
  return (
    <View style={s.container}>
      <View style={s.profile}>
        <View style={s.avatar}><Text style={s.avatarText}>👤</Text></View>
        <View>
          <Text style={s.name}>Admin</Text>
          <Text style={s.email}>admin@zonforge.local</Text>
          <View style={s.roleBadge}><Text style={s.roleText}>PLATFORM ADMIN</Text></View>
        </View>
      </View>
      <View style={s.section}>
        {SETTINGS.map((item, i) => (
          <View key={i} style={[s.row, i < SETTINGS.length - 1 && s.rowBorder]}>
            <Text style={s.rowIcon}>{item.icon}</Text>
            <View style={s.rowBody}>
              <Text style={s.rowLabel}>{item.label}</Text>
              <Text style={s.rowSub}>{item.sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Text style={s.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  profile:   { backgroundColor: C.card, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  avatar:    { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,217,255,.1)', borderWidth: 1, borderColor: 'rgba(0,217,255,.2)', alignItems: 'center', justifyContent: 'center' },
  avatarText:{ fontSize: 22 },
  name:      { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 2 },
  email:     { fontSize: 12, color: C.text, marginBottom: 6 },
  roleBadge: { backgroundColor: 'rgba(0,217,255,.1)', borderWidth: 1, borderColor: 'rgba(0,217,255,.2)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  roleText:  { fontSize: 8, color: C.cyan, fontFamily: 'monospace', letterSpacing: 1 },
  section:   { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  row:       { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  rowIcon:   { fontSize: 20, width: 32 },
  rowBody:   { flex: 1 },
  rowLabel:  { fontSize: 14, color: C.light, fontWeight: '500' },
  rowSub:    { fontSize: 11, color: '#2d5f80', marginTop: 2 },
  logoutBtn: { borderWidth: 1, borderColor: 'rgba(255,77,109,.3)', borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: 'rgba(255,77,109,.06)' },
  logoutText:{ fontSize: 14, fontWeight: '700', color: C.coral },
})
