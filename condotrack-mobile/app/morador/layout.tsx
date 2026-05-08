import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'

const AC = '#0F6E56'

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    index:    '📦',
    historico:'📋',
    perfil:   '👤',
  }
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.icon, focused && styles.iconFocused]}>{icons[name] || '•'}</Text>
    </View>
  )
}

export default function MoradorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:      false,
        tabBarActiveTintColor:   AC,
        tabBarInactiveTintColor: '#A1A1AA',
        tabBarStyle:      { borderTopColor: '#E4E4E7', backgroundColor: '#fff', height: 60, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Entregas',  tabBarIcon: ({ focused }) => <TabIcon name="index"    focused={focused} /> }} />
      <Tabs.Screen name="historico"options={{ title: 'Histórico', tabBarIcon: ({ focused }) => <TabIcon name="historico"focused={focused} /> }} />
      <Tabs.Screen name="perfil"   options={{ title: 'Perfil',    tabBarIcon: ({ focused }) => <TabIcon name="perfil"   focused={focused} /> }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabIcon:     { alignItems: 'center', justifyContent: 'center' },
  icon:        { fontSize: 20, opacity: 0.5 },
  iconFocused: { opacity: 1 },
})
