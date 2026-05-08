import { Tabs } from 'expo-router'

const AC = '#6D28D9'

export default function AdminLayout() {
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
      <Tabs.Screen name="relatorio"options={{ title: 'Relatórios',tabBarIcon: ({ color }) => <TabIcon emoji="📈" color={color} /> }} />
      <Tabs.Screen name="perfil"   options={{ title: 'Perfil',    tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }} />
    </Tabs>
  )
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require('react-native')
  return <Text style={{ fontSize: 20, opacity: color === '#A1A1AA' ? 0.5 : 1 }}>{emoji}</Text>
}
