/**
 * ZonForge Sentinel Mobile — Push Notifications
 * Sends instant alerts for P1/P2 security events
 */

import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:   true,
    shouldPlaySound:   true,
    shouldSetBadge:    true,
  }),
})

export function usePushNotifications() {
  const notificationListener = useRef<any>()
  const responseListener     = useRef<any>()

  useEffect(() => {
    registerForPushNotifications()

    // Handle notifications received while app is open
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification received:', notification.request.content.title)
    })

    // Handle notification tap
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data
      if (data?.alertId) {
        // Navigate to alert detail
        console.log('Navigate to alert:', data.alertId)
      }
    })

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current)
      Notifications.removeNotificationSubscription(responseListener.current)
    }
  }, [])
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require physical device')
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied')
    return null
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('security-alerts', {
      name:             'Security Alerts',
      importance:       Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#00d9ff',
      sound:            'notification.wav',
    })
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data
  console.log('📱 Push token:', token)
  return token
}

// ── Send local notification (for testing) ────────────────────────

export async function sendLocalAlert(title: string, body: string, alertId: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data:  { alertId },
      sound: 'notification.wav',
      badge: 1,
    },
    trigger: null, // immediate
  })
}
