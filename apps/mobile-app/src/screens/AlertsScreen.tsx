/**
 * ZonForge Sentinel Mobile — Alerts Screen
 * P1/P2 alert list with AI triage scores + quick actions
 */

import React, { useState } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, RefreshControl,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { alerts, investigations } from '../services/api'
import { useRouter } from 'expo-router'

const C = {
  bg:'#010a10',surface:'#060f18',card:'#08141f',border:'#0d2035',
  text:'#7aaec8',light:'#c0daea',white:'#e5f3fb',
  cyan:'#00d9ff',lime:'#1deb8a',amber:'#f0a500',coral:'#ff4d6d',violet:'#7c6af7',
}

const FILTERS = ['All','P1','P2','P3','Investigating','Resolved']

export default function AlertsScreen() {
  const router       = useRouter()
  const qc           = useQueryClient()
  const [filter, setFilter] = useState('All')
  const [running, setRunning] = useState<string | null>(null)

  const alertsQ = useQuery({
    queryKey: ['alerts-list', filter],
    queryFn:  () => alerts.list({
      status: filter === 'Investigating' ? 'investigating' : filter === 'Resolved' ? 'resolved' : 'open',
      limit: 50,
    }),
    refetchInterval: 15000,
  })

  const runAI = async (alertId: string) => {
    setRunning(alertId)
    try {
      await investigations.run(alertId)
      qc.invalidateQueries({ queryKey: ['alerts-list'] })
    } catch (e) {
      console.error(e)
    } finally {
      setRunning(null)
    }
  }

  const data = (alertsQ.data?.data || []).filter((a: any) => {
    if (filter === 'All') return true
    if (['P1','P2','P3'].includes(filter)) return a.priority === filter
    return true
  })

  const renderAlert = ({ item: a }: { item: any }) => (
    <TouchableOpacity
      style={s.card}
      onPress={() => router.push(`/alerts/${a.id}`)}
      activeOpacity={0.8}
    >
      <View style={[s.severityBar, { backgroundColor: a.severity === 'critical' ? C.coral : a.severity === 'high' ? C.amber : C.violet }]} />
      <View style={s.cardBody}>
        <View style={s.cardTop}>
          <Text style={s.cardTitle} numberOfLines={2}>{a.title}</Text>
          <View style={[s.priorityPill, { borderColor: a.priority === 'P1' ? C.coral : C.amber }]}>
            <Text style={[s.priorityText, { color: a.priority === 'P1' ? C.coral : C.amber }]}>{a.priority}</Text>
          </View>
        </View>
        <Text style={s.cardUser} numberOfLines={1}>
          {a.affectedUserId || 'Unknown'} · {a.affectedIp || 'N/A'}
        </Text>
        {a.aiUrgencyScore && (
          <View style={s.aiRow}>
            <Text style={s.aiLabel}>AI URGENCY</Text>
            <View style={s.aiBar}>
              <View style={[s.aiFill, {
                width: `${a.aiUrgencyScore}%`,
                backgroundColor: a.aiUrgencyScore >= 75 ? C.coral : a.aiUrgencyScore >= 50 ? C.amber : C.lime,
              }]} />
            </View>
            <Text style={[s.aiScore, { color: a.aiUrgencyScore >= 75 ? C.coral : a.aiUrgencyScore >= 50 ? C.amber : C.lime }]}>
              {a.aiUrgencyScore}
            </Text>
          </View>
        )}
        <View style={s.cardActions}>
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: C.cyan }]}
            onPress={() => runAI(a.id)}
            disabled={running === a.id}
          >
            <Text style={[s.actionText, { color: C.cyan }]}>
              {running === a.id ? '⟳ Investigating...' : '⬡ AI Investigate'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: C.lime }]}
            onPress={() => alerts.resolve(a.id).then(() => qc.invalidateQueries({ queryKey: ['alerts-list'] }))}
          >
            <Text style={[s.actionText, { color: C.lime }]}>✓ Resolve</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={s.container}>
      {/* Filter bar */}
      <View style={s.filterBar}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderAlert}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={alertsQ.isFetching} onRefresh={() => alertsQ.refetch()} tintColor={C.cyan} />}
        ListEmptyComponent={
          <View style={[s.empty]}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
            <Text style={{ color: C.lime, fontWeight: '700', fontSize: 16 }}>No alerts</Text>
            <Text style={{ color: C.text, fontSize: 12, marginTop: 4 }}>All clear for this filter</Text>
          </View>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.bg },
  filterBar:       { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, gap: 6 },
  filterBtn:       { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: C.border },
  filterActive:    { borderColor: C.cyan, backgroundColor: 'rgba(0,217,255,.08)' },
  filterText:      { fontSize: 11, color: C.text, fontFamily: 'monospace' },
  filterTextActive:{ color: C.cyan },
  card:            { backgroundColor: C.card, borderRadius: 12, marginBottom: 10, flexDirection: 'row', borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  severityBar:     { width: 3 },
  cardBody:        { flex: 1, padding: 14 },
  cardTop:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5 },
  cardTitle:       { flex: 1, fontSize: 14, fontWeight: '600', color: C.light, lineHeight: 20 },
  priorityPill:    { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  priorityText:    { fontSize: 10, fontWeight: '800', fontFamily: 'monospace' },
  cardUser:        { fontSize: 11, color: '#2d5f80', marginBottom: 8 },
  aiRow:           { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  aiLabel:         { fontSize: 8, color: '#2d5f80', letterSpacing: 1.5, fontFamily: 'monospace', width: 60 },
  aiBar:           { flex: 1, height: 3, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  aiFill:          { height: '100%', borderRadius: 2 },
  aiScore:         { fontSize: 12, fontWeight: '800', width: 28, textAlign: 'right', fontFamily: 'monospace' },
  cardActions:     { flexDirection: 'row', gap: 8 },
  actionBtn:       { flex: 1, borderWidth: 1, borderRadius: 6, paddingVertical: 7, alignItems: 'center' },
  actionText:      { fontSize: 11, fontWeight: '700' },
  empty:           { alignItems: 'center', paddingVertical: 60 },
})
