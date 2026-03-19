import { Tabs } from 'expo-router'
import { Text } from 'react-native'

const C = {
  bg:     '#010a10',
  surface:'#060f18',
  border: '#0d2035',
  cyan:   '#00d9ff',
  text:   '#4a85a8',
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor:  C.border,
          borderTopWidth:  1,
          height:          60,
          paddingBottom:   8,
        },
        tabBarActiveTintColor:    C.cyan,
        tabBarInactiveTintColor:  C.text,
        tabBarLabelStyle: {
          fontSize:    10,
          fontFamily: 'monospace',
          letterSpacing: 0.5,
        },
        headerStyle:      { backgroundColor: C.bg },
        headerTintColor:  '#e5f3fb',
        headerTitleStyle: { fontWeight: '800', letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title:        'Dashboard',
          headerTitle:  'ZonForge Sentinel',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>📊</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title:        'Alerts',
          headerTitle:  'Security Alerts',
          tabBarBadge:  4,
          tabBarBadgeStyle: { backgroundColor: '#ff4d6d', fontSize: 10 },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>🚨</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title:       'AI Chat',
          headerTitle: 'Security AI',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>💬</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title:       'Settings',
          headerTitle: 'Settings',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>⚙️</Text>
          ),
        }}
      />
    </Tabs>
  )
}
