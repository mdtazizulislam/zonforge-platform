import { Stack } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:           2,
      staleTime:       30_000,
      refetchInterval: 60_000,
    },
  },
})

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" backgroundColor="#010a10" />
      <Stack
        screenOptions={{
          headerStyle:      { backgroundColor: '#010a10' },
          headerTintColor:  '#e5f3fb',
          headerTitleStyle: { fontWeight: '800', letterSpacing: 1 },
          contentStyle:     { backgroundColor: '#010a10' },
          animation:        'slide_from_right',
        }}
      />
    </QueryClientProvider>
  )
}
