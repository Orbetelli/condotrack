import { Tabs } from 'expo-router'

const AC = '#1D4ED8'

export default function PorteiroLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:           false,
        tabBarActiveTintColor:   AC,
        tabBarInactiveTintColor: '#A1A1AA',
        tabBarStyle:      { borderTopColor: '#E4E4E7', backgroundColor: '#fff', height: 60, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} /> }} />
      <Tabs.Screen name="entregas" options={{ title: 'Entregas',  tabBarIcon: ({ color }) => <TabIcon emoji="📦" color={color} /> }} />
      <Tabs.Screen name="moradores"options={{ title: 'Moradores', tabBarIcon: ({ color }) => <TabIcon emoji="👥" color={color} /> }} />
      <Tabs.Screen name="historico"options={{ title: 'Histórico', tabBarIcon: ({ color }) => <TabIcon emoji="📋" color={color} /> }} />
    </Tabs>
  )
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require('react-native')
  return <Text style={{ fontSize: 20, opacity: color === '#A1A1AA' ? 0.5 : 1 }}>{emoji}</Text>
}
