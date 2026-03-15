import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="fournisseur" />
      <Tabs.Screen name="gestionnaire" />
      <Tabs.Screen name="chauffeur" />
      <Tabs.Screen name="agriculteur" />
    </Tabs>
  );
}