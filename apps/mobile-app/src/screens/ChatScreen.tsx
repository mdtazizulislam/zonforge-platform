/**
 * ZonForge Sentinel Mobile — Security AI Chat Screen
 */

import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, FlatList, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { assistant } from '../services/api'

const C = {
  bg:'#010a10',surface:'#060f18',card:'#08141f',border:'#0d2035',
  text:'#7aaec8',light:'#c0daea',white:'#e5f3fb',
  cyan:'#00d9ff',lime:'#1deb8a',amber:'#f0a500',coral:'#ff4d6d',
}

const QUICK = [
  'Current threat level?',
  'Any critical alerts?',
  'Top 3 urgent actions?',
  'Posture summary?',
]

type Message = { role: 'user' | 'assistant'; content: string; tools?: string[] }

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: '👋 I\'m ZonForge Security AI. I have real-time access to your platform data. Ask me about alerts, users, or your security posture.',
  }])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const listRef = useRef<FlatList>(null)

  const send = async (msg?: string) => {
    const text = (msg || input).trim()
    if (!text || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    try {
      const res = await assistant.chat(
        [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        sessionId
      )
      setSessionId(res.data.sessionId)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.message,
        tools: res.data.toolsUsed,
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Unable to reach AI service. Check your connection.',
      }])
    } finally {
      setLoading(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  const renderMsg = ({ item: m }: { item: Message }) => (
    <View style={[s.msgRow, m.role === 'user' && s.msgRowUser]}>
      {m.role === 'assistant' && <View style={s.avatar}><Text style={s.avatarText}>⬡</Text></View>}
      <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
        <Text style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>{m.content}</Text>
        {m.tools && m.tools.length > 0 && (
          <View style={s.toolsRow}>
            {m.tools.map(t => (
              <Text key={t} style={s.toolBadge}>{t}</Text>
            ))}
          </View>
        )}
      </View>
    </View>
  )

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Quick chips */}
      <View style={s.chips}>
        {QUICK.map(q => (
          <TouchableOpacity key={q} style={s.chip} onPress={() => send(q)}>
            <Text style={s.chipText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderMsg}
        contentContainerStyle={s.messages}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Typing indicator */}
      {loading && (
        <View style={s.typing}>
          <ActivityIndicator size="small" color={C.cyan} />
          <Text style={s.typingText}>AI is thinking...</Text>
        </View>
      )}

      {/* Input */}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
          placeholder="Ask about your security..."
          placeholderTextColor="#2d5f80"
          returnKeyType="send"
          multiline
        />
        <TouchableOpacity style={[s.sendBtn, !input.trim() && s.sendBtnDisabled]} onPress={() => send()} disabled={!input.trim() || loading}>
          <Text style={s.sendIcon}>→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#010a10' },
  chips:           { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: '#0d2035', backgroundColor: '#060f18' },
  chip:            { borderWidth: 1, borderColor: '#0d2035', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText:        { fontSize: 11, color: '#7aaec8' },
  messages:        { padding: 12, gap: 12 },
  msgRow:          { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowUser:      { justifyContent: 'flex-end' },
  avatar:          { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,217,255,.1)', borderWidth: 1, borderColor: 'rgba(0,217,255,.2)', alignItems: 'center', justifyContent: 'center' },
  avatarText:      { fontSize: 12, color: '#00d9ff' },
  bubble:          { maxWidth: '78%', borderRadius: 14, padding: 12 },
  bubbleAI:        { backgroundColor: '#08141f', borderWidth: 1, borderColor: '#0d2035', borderBottomLeftRadius: 2 },
  bubbleUser:      { backgroundColor: 'rgba(0,217,255,.15)', borderWidth: 1, borderColor: 'rgba(0,217,255,.25)', borderBottomRightRadius: 2 },
  bubbleText:      { fontSize: 14, color: '#c0daea', lineHeight: 21 },
  bubbleTextUser:  { color: '#e5f3fb' },
  toolsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  toolBadge:       { fontSize: 9, color: '#4a85a8', borderWidth: 1, borderColor: '#0d2035', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, fontFamily: 'monospace' },
  typing:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  typingText:      { fontSize: 12, color: '#2d5f80', fontFamily: 'monospace' },
  inputRow:        { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#0d2035', backgroundColor: '#060f18' },
  input:           { flex: 1, backgroundColor: '#08141f', borderWidth: 1, borderColor: '#0d2035', borderRadius: 10, padding: 12, color: '#e5f3fb', fontSize: 14, maxHeight: 100 },
  sendBtn:         { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(0,217,255,.15)', borderWidth: 1, borderColor: 'rgba(0,217,255,.35)', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon:        { fontSize: 18, color: '#00d9ff', fontWeight: '700' },
})
