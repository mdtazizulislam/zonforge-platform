/**
 * ZonForge Sentinel Mobile — App Navigator
 * Bottom tab navigation
 */

import React from 'react'
import { View, Text } from 'react-native'
import { Tabs } from 'expo-router'

const C = { bg: '#010a10', surface: '#060f18', border: '#0d2035', cyan: '#00d9ff', text: '#4a85a8' }

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icon}</Text>
    </View>
  )
}

export default function AppNavigator() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor:   C.cyan,
        tabBarInactiveTintColor: C.text,
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'monospace', letterSpacing: 0.5 },
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: '#e5f3fb',
        headerTitleStyle: { fontWeight: '800', letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} />,
          headerTitle: 'ZonForge Sentinel',
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ focused }) => <TabIcon icon="🚨" focused={focused} />,
          headerTitle: 'Security Alerts',
          tabBarBadge: 4,
          tabBarBadgeStyle: { backgroundColor: '#ff4d6d', fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'AI Chat',
          tabBarIcon: ({ focused }) => <TabIcon icon="💬" focused={focused} />,
          headerTitle: 'Security AI Assistant',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" focused={focused} />,
          headerTitle: 'Settings',
        }}
      />
    </Tabs>
  )
}
