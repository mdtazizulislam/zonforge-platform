import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { auth, setToken } from '../services/api'
import { useRouter } from 'expo-router'

const C = { bg:'#010a10',card:'#08141f',border:'#0d2035',text:'#7aaec8',white:'#e5f3fb',cyan:'#00d9ff',coral:'#ff4d6d' }

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async () => {
    if (!email || !password) { setError('Please enter email and password'); return }
    setLoading(true); setError('')
    try {
      const res = await auth.login(email, password)
      await setToken(res.data.accessToken)
      router.replace('/')
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? 'Invalid email or password' : 'Connection error. Check your network.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.inner}>
        <View style={s.logo}>
          <View style={s.logoMark}><Text style={s.logoText}>ZF</Text></View>
          <Text style={s.logoName}>ZONFORGE</Text>
          <Text style={s.logoTag}>SENTINEL</Text>
        </View>
        <Text style={s.tagline}>AI-Native Cybersecurity Platform</Text>
        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}
        <View style={s.form}>
          <Text style={s.label}>EMAIL</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="admin@company.com" placeholderTextColor="#2d5f80" autoCapitalize="none" keyboardType="email-address" />
          <Text style={[s.label, { marginTop: 14 }]}>PASSWORD</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="••••••••••" placeholderTextColor="#2d5f80" secureTextEntry />
          <TouchableOpacity style={[s.loginBtn, loading && s.loginBtnDisabled]} onPress={login} disabled={loading}>
            {loading ? <ActivityIndicator color={C.cyan} /> : <Text style={s.loginText}>Sign In →</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inner:     { flex: 1, justifyContent: 'center', padding: 32 },
  logo:      { alignItems: 'center', marginBottom: 8 },
  logoMark:  { width: 56, height: 56, borderRadius: 14, backgroundColor: 'linear-gradient(135deg,#062540,#00d9ff)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, backgroundColor: '#062540', borderWidth: 1, borderColor: '#00d9ff' },
  logoText:  { fontSize: 22, fontWeight: '900', color: '#fff' },
  logoName:  { fontSize: 28, fontWeight: '900', color: '#e5f3fb', letterSpacing: 4 },
  logoTag:   { fontSize: 11, color: '#2d5f80', letterSpacing: 3, fontFamily: 'monospace' },
  tagline:   { textAlign: 'center', color: '#4a85a8', fontSize: 13, marginBottom: 36 },
  errorBox:  { backgroundColor: 'rgba(255,77,109,.08)', borderWidth: 1, borderColor: 'rgba(255,77,109,.3)', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { color: '#ff4d6d', fontSize: 13, textAlign: 'center' },
  form:      { backgroundColor: C.card, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: C.border },
  label:     { fontSize: 9, color: '#2d5f80', letterSpacing: 2, fontFamily: 'monospace', marginBottom: 6 },
  input:     { backgroundColor: '#060f18', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 13, color: C.white, fontSize: 14, marginBottom: 4 },
  loginBtn:  { backgroundColor: 'rgba(0,217,255,.15)', borderWidth: 1, borderColor: 'rgba(0,217,255,.35)', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  loginBtnDisabled: { opacity: 0.6 },
  loginText: { color: '#00d9ff', fontSize: 15, fontWeight: '700' },
})
