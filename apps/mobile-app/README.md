# ZonForge Sentinel — Mobile App

React Native + Expo mobile client for ZonForge Sentinel.

## Features

| Feature | Description |
|---------|-------------|
| 📊 Dashboard | Live posture score, open alerts, MTTD metrics |
| 🚨 Alerts | P1/P2 alert list with AI triage scores + quick actions |
| 💬 AI Chat | Security Assistant powered by claude-sonnet-4-6 |
| 🔔 Push Notifications | Instant P1/P2 alert notifications |
| ⚙️ Settings | Account management, notification preferences |

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

## Environment

Create `.env.local` in this directory:
```
EXPO_PUBLIC_API_URL=https://api.zonforge.com
```

For local development:
```
EXPO_PUBLIC_API_URL=http://localhost:3000
```

## Build for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for iOS
eas build --platform ios --profile production

# Build for Android
eas build --platform android --profile production

# Submit to App Store
eas submit --platform ios --profile production

# Submit to Play Store
eas submit --platform android --profile production
```

## Architecture

```
mobile-app/
├── src/
│   ├── app/           ← Expo Router screens
│   │   ├── (tabs)/    ← Bottom tab navigation
│   │   │   ├── index.tsx     → Dashboard
│   │   │   ├── alerts.tsx    → Alert list
│   │   │   ├── chat.tsx      → AI Chat
│   │   │   └── settings.tsx  → Settings
│   │   └── login.tsx  → Login screen
│   ├── screens/       ← Screen components
│   ├── services/      ← API client (same backend as web)
│   ├── hooks/         ← Push notifications
│   └── navigation/    ← Navigator config
├── app.json           ← Expo config
├── eas.json           ← EAS Build config
└── package.json
```

## Same Backend

The mobile app uses the **exact same API** as the web dashboard.
No separate backend needed — just set `EXPO_PUBLIC_API_URL`.
