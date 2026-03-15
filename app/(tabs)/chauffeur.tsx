import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function ChauffeurDashboard() {
  return (
    <View style={s.container}>
      <Text style={s.emoji}>🚚</Text>
      <Text style={s.title}>Espace Chauffeur</Text>
      <Text style={s.sub}>Interface en cours de développement</Text>
      <TouchableOpacity style={s.btn} onPress={async () => {
        await supabase.auth.signOut();
        router.replace('/(auth)/login');
      }}>
        <Text style={s.btnTxt}>↩ Déconnexion</Text>
      </TouchableOpacity>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#faf6f0', gap:12 },
  emoji:     { fontSize: 56 },
  title:     { fontSize: 22, fontWeight: '800', color: '#3a6b35' },
  sub:       { fontSize: 14, color: '#8a7560' },
  btn:       { marginTop: 20, backgroundColor: '#3a6b35', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 50 },
  btnTxt:    { color: '#fff', fontWeight: '700', fontSize: 14 },
});