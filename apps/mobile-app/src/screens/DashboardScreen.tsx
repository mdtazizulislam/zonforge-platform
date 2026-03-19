/**
 * ZonForge Sentinel Mobile — Dashboard Screen
 * Shows security posture, open alerts, high-risk users
 */

import React from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { risk, alerts, triage } from '../services/api'
import { useRouter } from 'expo-router'

const C = {
  bg:      '#010a10',
  surface: '#060f18',
  card:    '#08141f',
  border:  '#0d2035',
  text:    '#7aaec8',
  light:   '#c0daea',
  white:   '#e5f3fb',
  cyan:    '#00d9ff',
  lime:    '#1deb8a',
  amber:   '#f0a500',
  coral:   '#ff4d6d',
  violet:  '#7c6af7',
}

export default function DashboardScreen() {
  const router   = useRouter()
  const postureQ = useQuery({ queryKey: ['posture'],    queryFn: risk.posture,    refetchInterval: 30000 })
  const alertsQ  = useQuery({ queryKey: ['alerts'],     queryFn: () => alerts.list({ status: 'open', limit: 5 }), refetchInterval: 15000 })
  const triageQ  = useQuery({ queryKey: ['triage'],     queryFn: triage.queue,   refetchInterval: 30000 })

  const posture   = postureQ.data?.data
  const openAlerts = alertsQ.data?.data || []
  const triageList = triageQ.data?.data || []

  const isLoading = postureQ.isLoading && alertsQ.isLoading
  const refetch   = () => { postureQ.refetch(); alertsQ.refetch(); triageQ.refetch() }

  if (isLoading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={C.cyan} />
        <Text style={s.loadingText}>Loading security data...</Text>
      </View>
    )
  }

  const score = posture?.postureScore || 74
  const scoreColor = score >= 80 ? C.lime : score >= 60 ? C.amber : C.coral

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={postureQ.isFetching} onRefresh={refetch} tintColor={C.cyan} />}
    >
      {/* ── Posture Score ── */}
      <View style={s.card}>
        <Text style={s.cardLabel}>SECURITY POSTURE</Text>
        <View style={s.postureRow}>
          <Text style={[s.postureScore, { color: scoreColor }]}>{score}</Text>
          <Text style={s.postureMax}>/100</Text>
          <View style={s.postureInfo}>
            <Text style={[s.postureBadge, { color: scoreColor, borderColor: scoreColor }]}>
              {score >= 80 ? 'GOOD' : score >= 60 ? 'ELEVATED' : 'CRITICAL'}
            </Text>
            <Text style={s.postureChange}>⬆ +8 this week</Text>
          </View>
        </View>
        <View style={s.metricRow}>
          <View style={s.metricItem}>
            <Text style={[s.metricVal, { color: C.lime }]}>4.2s</Text>
            <Text style={s.metricLbl}>MTTD</Text>
          </View>
          <View style={s.metricItem}>
            <Text style={[s.metricVal, { color: C.coral }]}>{posture?.openAlerts || openAlerts.length}</Text>
            <Text style={s.metricLbl}>OPEN ALERTS</Text>
          </View>
          <View style={s.metricItem}>
            <Text style={[s.metricVal, { color: C.cyan }]}>38</Text>
            <Text style={s.metricLbl}>AI SOLVED TODAY</Text>
          </View>
          <View style={s.metricItem}>
            <Text style={[s.metricVal, { color: C.violet }]}>8%</Text>
            <Text style={s.metricLbl}>FALSE POSITIVES</Text>
          </View>
        </View>
      </View>

      {/* ── Critical Alerts ── */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>OPEN ALERTS</Text>
          <TouchableOpacity onPress={() => router.push('/alerts')}>
            <Text style={s.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>
        {openAlerts.length === 0 ? (
          <View style={[s.card, s.center, { paddingVertical: 32 }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
            <Text style={{ color: C.lime, fontWeight: '700' }}>No open alerts</Text>
          </View>
        ) : (
          openAlerts.map((alert: any) => (
            <TouchableOpacity
              key={alert.id}
              style={s.alertCard}
              onPress={() => router.push(`/alerts/${alert.id}`)}
            >
              <View style={[s.alertBar, { backgroundColor: alert.severity === 'critical' ? C.coral : C.amber }]} />
              <View style={s.alertBody}>
                <Text style={s.alertTitle} numberOfLines={1}>{alert.title}</Text>
                <Text style={s.alertMeta}>{alert.affectedUserId || 'Unknown user'} · {alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString() : 'Just now'}</Text>
              </View>
              <Text style={[s.priorityBadge, { color: alert.severity === 'critical' ? C.coral : C.amber }]}>
                {alert.priority || 'P2'}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* ── AI Triage Queue ── */}
      {triageList.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>AI TRIAGE QUEUE</Text>
          {triageList.slice(0, 3).map((item: any) => (
            <View key={item.alertId} style={s.triageCard}>
              <View style={s.triageLeft}>
                <Text style={[s.urgencyScore, { color: item.urgencyScore >= 75 ? C.coral : item.urgencyScore >= 50 ? C.amber : C.lime }]}>
                  {item.urgencyScore}
                </Text>
                <Text style={s.urgencyLbl}>URGENCY</Text>
              </View>
              <View style={s.triageRight}>
                <Text style={s.triageTitle} numberOfLines={1}>{item.alertTitle || 'Alert'}</Text>
                <Text style={s.triageGuidance} numberOfLines={1}>{item.analystGuidance || 'Review required'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  center:       { justifyContent: 'center', alignItems: 'center' },
  loadingText:  { color: C.text, marginTop: 12, fontFamily: 'monospace', fontSize: 12 },
  card:         { backgroundColor: C.card, borderRadius: 12, padding: 16, margin: 16, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  cardLabel:    { fontFamily: 'monospace', fontSize: 9, color: '#2d5f80', letterSpacing: 2, marginBottom: 12 },
  postureRow:   { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
  postureScore: { fontSize: 56, fontWeight: '900', lineHeight: 60 },
  postureMax:   { fontSize: 20, color: C.text, marginLeft: 4, alignSelf: 'flex-end', marginBottom: 8 },
  postureInfo:  { marginLeft: 16, flex: 1 },
  postureBadge: { fontSize: 10, fontWeight: '800', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 4 },
  postureChange:{ fontSize: 11, color: C.lime },
  metricRow:    { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  metricItem:   { alignItems: 'center' },
  metricVal:    { fontSize: 20, fontWeight: '900' },
  metricLbl:    { fontSize: 8, color: '#2d5f80', letterSpacing: 1, marginTop: 2, fontFamily: 'monospace' },
  section:      { marginHorizontal: 16, marginBottom: 8 },
  sectionHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontFamily: 'monospace', fontSize: 9, color: '#2d5f80', letterSpacing: 2 },
  seeAll:       { fontSize: 12, color: C.cyan },
  alertCard:    { backgroundColor: C.card, borderRadius: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 6, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  alertBar:     { width: 3, alignSelf: 'stretch' },
  alertBody:    { flex: 1, padding: 12 },
  alertTitle:   { fontSize: 13, fontWeight: '600', color: C.light, marginBottom: 3 },
  alertMeta:    { fontSize: 10, color: '#2d5f80' },
  priorityBadge:{ fontSize: 11, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 4 },
  triageCard:   { backgroundColor: C.card, borderRadius: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 6, padding: 12, borderWidth: 1, borderColor: C.border },
  triageLeft:   { alignItems: 'center', marginRight: 14, minWidth: 48 },
  urgencyScore: { fontSize: 28, fontWeight: '900', lineHeight: 30 },
  urgencyLbl:   { fontSize: 7, color: '#2d5f80', letterSpacing: 1, fontFamily: 'monospace' },
  triageRight:  { flex: 1 },
  triageTitle:  { fontSize: 13, fontWeight: '600', color: C.light, marginBottom: 3 },
  triageGuidance:{ fontSize: 11, color: '#4a85a8' },
})
