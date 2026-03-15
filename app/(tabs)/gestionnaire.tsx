import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, RefreshControl, Modal, ActivityIndicator,
  Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';

const { width: SW } = Dimensions.get('window');

// ── Types ──────────────────────────────────────────────────────
type Statut = 'en_attente' | 'planifie' | 'collecte' | 'traitement' | 'annule';

interface Depot {
  id: string;
  type_dechet: string;
  quantite_kg: number;
  adresse: string;
  statut: Statut;
  date_demande: string;
  notes?: string;
  profiles?: { nom: string; telephone?: string };
}

// ── Config statuts ─────────────────────────────────────────────
const SC: Record<Statut, { label: string; color: string; bg: string; emoji: string; next?: Statut }> = {
  en_attente: { label: 'En attente',    color: '#b45309', bg: '#fef3c7', emoji: '⏳', next: 'planifie'   },
  planifie:   { label: 'Planifié',      color: '#1d4ed8', bg: '#dbeafe', emoji: '📅', next: 'collecte'   },
  collecte:   { label: 'Collecté',      color: '#15803d', bg: '#dcfce7', emoji: '✅', next: 'traitement' },
  traitement: { label: 'En traitement', color: '#7e22ce', bg: '#f3e8ff', emoji: '⚙️'                     },
  annule:     { label: 'Annulé',        color: '#dc2626', bg: '#fee2e2', emoji: '❌'                     },
};

const STATUT_ORDER: Statut[] = ['en_attente', 'planifie', 'collecte', 'traitement', 'annule'];

function today() {
  return new Date().toLocaleDateString('fr-MA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' });
}

// ══════════════════════════════════════════════════════════════
export default function GestionnaireDashboard() {
  const [gestNom,       setGestNom]       = useState('Gestionnaire');
  const [depots,        setDepots]        = useState<Depot[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [selectedDepot, setSelectedDepot] = useState<Depot | null>(null);
  const [updating,      setUpdating]      = useState(false);

  // Derived stats
  const [kgTotal,       setKgTotal]       = useState(0);
  const [kgMois,        setKgMois]        = useState(0);
  const [counts,        setCounts]        = useState<Record<Statut, number>>({
    en_attente: 0, planifie: 0, collecte: 0, traitement: 0, annule: 0,
  });

  // Animations
  const fadeHdr  = useRef(new Animated.Value(0)).current;
  const fadeBody = useRef(new Animated.Value(0)).current;
  const fabScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadData();
    Animated.stagger(200, [
      Animated.spring(fadeHdr,  { toValue: 1, useNativeDriver: true }),
      Animated.spring(fadeBody, { toValue: 1, useNativeDriver: true }),
      Animated.spring(fabScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/(auth)/login'); return; }

      const { data: prof } = await supabase
        .from('profiles').select('nom').eq('id', user.id).single();
      if (prof) setGestNom(prof.nom);

      const { data } = await supabase
        .from('dechets')
        .select('*, profiles(nom, telephone)')
        .order('date_demande', { ascending: false });

      if (data) {
        // Trier : urgents d'abord
        const sorted = [...data].sort((a, b) => {
          if (a.statut === 'en_attente' && b.statut !== 'en_attente') return -1;
          if (b.statut === 'en_attente' && a.statut !== 'en_attente') return 1;
          return new Date(b.date_demande).getTime() - new Date(a.date_demande).getTime();
        });
        setDepots(sorted);

        // Stats
        const now = new Date();
        const debut = new Date(now.getFullYear(), now.getMonth(), 1);
        const actifs = data.filter((d: Depot) => d.statut !== 'annule');
        setKgTotal(actifs.reduce((s: number, d: Depot) => s + d.quantite_kg, 0));
        setKgMois(data.filter((d: Depot) => new Date(d.date_demande) >= debut && d.statut !== 'annule')
          .reduce((s: number, d: Depot) => s + d.quantite_kg, 0));
        const c = { en_attente:0, planifie:0, collecte:0, traitement:0, annule:0 };
        data.forEach((d: Depot) => { c[d.statut] = (c[d.statut] || 0) + 1; });
        setCounts(c);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, []);

  async function changeStatut(id: string, statut: Statut) {
    setUpdating(true);
    const { error } = await supabase.from('dechets').update({ statut }).eq('id', id);
    setUpdating(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setSelectedDepot(null);
    loadData();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  // Pourcentage objectif mensuel (5000 kg)
  const pct = Math.min(Math.round((kgMois / 5000) * 100), 100);

  // ── Render ────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[GD]} />}
      >

        {/* ══ CARTE BIENVENUE ═══════════════════════════════ */}
        <Animated.View style={{ opacity: fadeHdr, transform: [{ translateY: fadeHdr.interpolate({ inputRange:[0,1], outputRange:[-16,0] }) }] }}>
          <View style={s.welcomeCard}>
            {/* Top row */}
            <View style={s.welcomeTop}>
              <View style={s.avatarWrap}>
                <Text style={s.avatarTxt}>{gestNom.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex:1, marginLeft:12 }}>
                <Text style={s.welcomeHello}>Bonjour 👋</Text>
                <Text style={s.welcomeName}>{gestNom}</Text>
                <Text style={s.welcomeRole}>📊 Gestionnaire des opérations</Text>
              </View>
              <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
                <Text style={s.logoutTxt}>↩</Text>
              </TouchableOpacity>
            </View>

            {/* Date */}
            <View style={s.dateRow}>
              <Text style={s.dateTxt}>📅 {today()}</Text>
            </View>

            {/* Alerte urgences */}
            {counts.en_attente > 0 && (
              <View style={s.urgenceRow}>
                <View style={s.urgenceDot} />
                <Text style={s.urgenceTxt}>
                  {counts.en_attente} dépôt{counts.en_attente > 1 ? 's' : ''} urgents — action requise
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: fadeBody, transform: [{ translateY: fadeBody.interpolate({ inputRange:[0,1], outputRange:[20,0] }) }] }}>

          {/* ══ CARTES STATUT (SWIPE HORIZONTAL) ═════════════ */}
          <Text style={s.sectionTitle}>Statuts des dépôts</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.statusScroll}
          >
            {STATUT_ORDER.map(st => (
              <View key={st} style={[s.statusCard, { borderTopColor: SC[st].color }]}>
                <Text style={s.statusCardEmoji}>{SC[st].emoji}</Text>
                <Text style={[s.statusCardCount, { color: SC[st].color }]}>{counts[st]}</Text>
                <Text style={s.statusCardLabel}>{SC[st].label}</Text>
              </View>
            ))}
          </ScrollView>

          {/* ══ GRAPHIQUE CIRCULAIRE OBJECTIF ════════════════ */}
          <Text style={s.sectionTitle}>Objectif mensuel</Text>
          <View style={s.objectifCard}>
            {/* Cercle de progression simulé avec View */}
            <View style={s.circleWrap}>
              <View style={s.circleOuter}>
                <View style={s.circleInner}>
                  <Text style={s.circlePct}>{pct}%</Text>
                  <Text style={s.circleKg}>{kgMois} kg</Text>
                </View>
              </View>
              {/* Arc de progression (simulation CSS) */}
              <View style={[s.arcFill, { opacity: pct / 100 }]} />
            </View>

            <View style={s.objectifRight}>
              <Text style={s.objectifTitle}>Collectes ce mois</Text>
              <Text style={s.objectifSub}>Objectif : 5 000 kg</Text>
              <View style={s.barWrap}>
                <View style={s.barBg}>
                  <View style={[s.barFill, { width: `${pct}%` as any }]} />
                </View>
                <Text style={s.barPct}>{pct}%</Text>
              </View>

              {/* Production estimée */}
              <View style={s.prodRow}>
                <View style={s.prodChip}>
                  <Text style={s.prodEmoji}>🌱</Text>
                  <View>
                    <Text style={s.prodVal}>{Math.round(kgTotal * 0.30)} kg</Text>
                    <Text style={s.prodLbl}>Fertilisant</Text>
                  </View>
                </View>
                <View style={[s.prodChip, { backgroundColor: '#fff7ed' }]}>
                  <Text style={s.prodEmoji}>🔥</Text>
                  <View>
                    <Text style={[s.prodVal, { color: '#c2410c' }]}>{Math.round(kgTotal * 0.15)} kg</Text>
                    <Text style={s.prodLbl}>Biogaz</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ══ LISTE DÉPÔTS (URGENTS EN PREMIER) ════════════ */}
          <View style={s.listHeader}>
            <Text style={s.sectionTitle}>Tous les dépôts</Text>
            <View style={s.totalBadge}>
              <Text style={s.totalBadgeTxt}>{depots.length}</Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={GD} style={{ marginTop: 40 }} size="large" />
          ) : depots.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>📭</Text>
              <Text style={{ color: MUTED, marginTop: 10, fontSize: 14 }}>Aucun dépôt pour l'instant</Text>
            </View>
          ) : (
            depots.map((depot, index) => {
              const sc = SC[depot.statut];
              const isUrgent = depot.statut === 'en_attente';
              return (
                <TouchableOpacity
                  key={depot.id}
                  style={[s.depotCard, isUrgent && s.depotCardUrgent]}
                  onPress={() => setSelectedDepot(depot)}
                  activeOpacity={0.82}
                >
                  {/* Badge urgence */}
                  {isUrgent && (
                    <View style={s.urgentBanner}>
                      <Text style={s.urgentBannerTxt}>⚡ ACTION REQUISE</Text>
                    </View>
                  )}

                  <View style={s.depotTop}>
                    {/* Icône statut */}
                    <View style={[s.depotIconWrap, { backgroundColor: sc.bg }]}>
                      <Text style={{ fontSize: 20 }}>{sc.emoji}</Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.depotType}>{depot.type_dechet}</Text>
                      <Text style={s.depotMeta}>
                        👤 {depot.profiles?.nom || '—'}  ·  📅 {formatDate(depot.date_demande)}
                      </Text>
                      <Text style={s.depotAddr} numberOfLines={1}>📍 {depot.adresse}</Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.depotKg}>{depot.quantite_kg}</Text>
                      <Text style={s.depotKgUnit}>kg</Text>
                      <View style={[s.depotStatutBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[s.depotStatutTxt, { color: sc.color }]}>{sc.label}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Action rapide si statut suivant existe */}
                  {sc.next && (
                    <TouchableOpacity
                      style={[s.quickAction, isUrgent && s.quickActionUrgent]}
                      onPress={() => changeStatut(depot.id, sc.next!)}
                    >
                      <Text style={[s.quickActionTxt, isUrgent && { color: '#92400e' }]}>
                        → Passer à {SC[sc.next].emoji} {SC[sc.next].label}
                      </Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ height: 100 }} />
        </Animated.View>
      </ScrollView>

      {/* ══ FAB ══════════════════════════════════════════════ */}
      <Animated.View style={[s.fabWrap, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity style={s.fab} onPress={onRefresh} activeOpacity={0.85}>
          <Text style={s.fabIcon}>↻</Text>
          <Text style={s.fabTxt}>Actualiser</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ══ MODAL DÉTAIL ════════════════════════════════════ */}
      <Modal visible={!!selectedDepot} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />

            {selectedDepot && (() => {
              const sc = SC[selectedDepot.statut];
              return (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {/* Header modal */}
                  <View style={[s.modalHeader, { backgroundColor: sc.bg }]}>
                    <Text style={{ fontSize: 32 }}>{sc.emoji}</Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[s.modalStatutTxt, { color: sc.color }]}>{sc.label}</Text>
                      <Text style={s.modalType}>{selectedDepot.type_dechet}</Text>
                    </View>
                    <Text style={s.modalKg}>{selectedDepot.quantite_kg} kg</Text>
                  </View>

                  {/* Infos */}
                  <View style={s.infoGrid}>
                    {[
                      { icon:'👤', lbl:'Fournisseur', val: selectedDepot.profiles?.nom || '—' },
                      { icon:'📞', lbl:'Téléphone',   val: selectedDepot.profiles?.telephone || '—' },
                      { icon:'📍', lbl:'Adresse',     val: selectedDepot.adresse },
                      { icon:'📅', lbl:'Date',        val: formatDate(selectedDepot.date_demande) },
                      { icon:'💬', lbl:'Notes',       val: selectedDepot.notes || '—' },
                    ].map(row => (
                      <View key={row.lbl} style={s.infoRow}>
                        <Text style={s.infoIcon}>{row.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.infoLbl}>{row.lbl}</Text>
                          <Text style={s.infoVal}>{row.val}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Production estimée */}
                  <View style={s.prodEstCard}>
                    <Text style={s.prodEstTitle}>🔬 Production estimée de ce dépôt</Text>
                    <View style={s.prodEstRow}>
                      <View style={s.prodEstItem}>
                        <Text style={s.prodEstEmoji}>🌱</Text>
                        <Text style={s.prodEstVal}>{Math.round(selectedDepot.quantite_kg * 0.30)} kg</Text>
                        <Text style={s.prodEstLbl}>Fertilisant</Text>
                      </View>
                      <View style={s.prodEstDivider} />
                      <View style={s.prodEstItem}>
                        <Text style={s.prodEstEmoji}>🔥</Text>
                        <Text style={[s.prodEstVal, { color: '#c2410c' }]}>{Math.round(selectedDepot.quantite_kg * 0.15)} kg</Text>
                        <Text style={s.prodEstLbl}>Biogaz</Text>
                      </View>
                      <View style={s.prodEstDivider} />
                      <View style={s.prodEstItem}>
                        <Text style={s.prodEstEmoji}>💧</Text>
                        <Text style={[s.prodEstVal, { color: '#0369a1' }]}>{Math.round(selectedDepot.quantite_kg * 0.08)} L</Text>
                        <Text style={s.prodEstLbl}>Digestat</Text>
                      </View>
                    </View>
                  </View>

                  {/* Changer statut */}
                  <Text style={s.changeStatutTitle}>Changer le statut</Text>
                  <View style={s.changeStatutGrid}>
                    {STATUT_ORDER.filter(st => st !== selectedDepot.statut && st !== 'annule').map(st => (
                      <TouchableOpacity
                        key={st}
                        style={[s.changeStatutBtn, { borderColor: SC[st].color, backgroundColor: SC[st].bg }]}
                        onPress={() => changeStatut(selectedDepot.id, st)}
                        disabled={updating}
                      >
                        <Text style={{ fontSize: 18 }}>{SC[st].emoji}</Text>
                        <Text style={[s.changeStatutBtnTxt, { color: SC[st].color }]}>{SC[st].label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {updating && <ActivityIndicator color={GD} style={{ marginVertical: 10 }} />}

                  {/* Boutons bas */}
                  <View style={s.modalBtns}>
                    <TouchableOpacity
                      style={s.btnAnnuler}
                      onPress={() => Alert.alert(
                        'Annuler ce dépôt ?', 'Cette action est irréversible.',
                        [{ text: 'Non', style: 'cancel' },
                         { text: 'Oui', style: 'destructive', onPress: () => changeStatut(selectedDepot.id, 'annule') }]
                      )}
                    >
                      <Text style={s.btnAnnulerTxt}>❌ Annuler le dépôt</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.btnFermer} onPress={() => setSelectedDepot(null)}>
                      <Text style={s.btnFermerTxt}>Fermer</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ height: 30 }} />
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── COULEURS ──────────────────────────────────────────────────
const GD    = '#3a6b35';
const BROWN = '#5c3d1e';
const CREAM = '#faf6f0';
const SAND  = '#e8dcc8';
const MUTED = '#8a7560';

// ── STYLES ────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0ebe0' },

  // Welcome card
  welcomeCard:  { backgroundColor: GD, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, padding: 20, paddingTop: 16, paddingBottom: 24 },
  welcomeTop:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatarWrap:   { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarTxt:    { color: '#fff', fontSize: 22, fontWeight: '800' },
  welcomeHello: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  welcomeName:  { color: '#fff', fontSize: 20, fontWeight: '800' },
  welcomeRole:  { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  logoutBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  logoutTxt:    { color: '#fff', fontSize: 18 },
  dateRow:      { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 10 },
  dateTxt:      { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  urgenceRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', borderRadius: 12, padding: 10 },
  urgenceDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d97706' },
  urgenceTxt:   { color: '#92400e', fontSize: 12, fontWeight: '700', flex: 1 },

  // Section titles
  sectionTitle: { fontSize: 15, fontWeight: '800', color: BROWN, paddingHorizontal: 20, marginTop: 20, marginBottom: 12 },

  // Status swipe cards
  statusScroll: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  statusCard:   { width: 90, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', borderTopWidth: 4, shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.07, shadowRadius:8, elevation:3 },
  statusCardEmoji:{ fontSize: 22, marginBottom: 6 },
  statusCardCount:{ fontSize: 24, fontWeight: '800' },
  statusCardLabel:{ fontSize: 10, color: MUTED, textAlign: 'center', marginTop: 2, fontWeight: '600' },

  // Objectif card
  objectifCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16, shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.07, shadowRadius:8, elevation:3 },
  circleWrap:   { position: 'relative', width: 90, height: 90 },
  circleOuter:  { width: 90, height: 90, borderRadius: 45, borderWidth: 8, borderColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center' },
  circleInner:  { alignItems: 'center' },
  circlePct:    { fontSize: 18, fontWeight: '800', color: GD },
  circleKg:     { fontSize: 10, color: MUTED, fontWeight: '600' },
  arcFill:      { position: 'absolute', width: 90, height: 90, borderRadius: 45, borderWidth: 8, borderColor: GD, borderTopColor: 'transparent', borderRightColor: 'transparent' },
  objectifRight:{ flex: 1 },
  objectifTitle:{ fontSize: 14, fontWeight: '700', color: BROWN, marginBottom: 2 },
  objectifSub:  { fontSize: 11, color: MUTED, marginBottom: 10 },
  barWrap:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  barBg:        { flex: 1, backgroundColor: '#f0ebe0', borderRadius: 50, height: 8 },
  barFill:      { backgroundColor: GD, borderRadius: 50, height: '100%', minWidth: 8 },
  barPct:       { fontSize: 12, fontWeight: '700', color: GD, width: 36 },
  prodRow:      { flexDirection: 'row', gap: 8 },
  prodChip:     { flex: 1, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  prodEmoji:    { fontSize: 18 },
  prodVal:      { fontSize: 13, fontWeight: '800', color: GD },
  prodLbl:      { fontSize: 9, color: MUTED },

  // Liste header
  listHeader:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 20, marginBottom: 12, gap: 10 },
  totalBadge:   { backgroundColor: GD, borderRadius: 50, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  totalBadgeTxt:{ color: '#fff', fontSize: 12, fontWeight: '700' },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 48 },

  // Depot card
  depotCard:       { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.07, shadowRadius:8, elevation:3 },
  depotCardUrgent: { borderWidth: 1.5, borderColor: '#fbbf24' },
  urgentBanner:    { backgroundColor: '#fef3c7', paddingHorizontal: 14, paddingVertical: 6 },
  urgentBannerTxt: { fontSize: 10, fontWeight: '800', color: '#92400e', letterSpacing: 0.5 },
  depotTop:        { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  depotIconWrap:   { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  depotType:       { fontSize: 14, fontWeight: '700', color: BROWN, marginBottom: 3 },
  depotMeta:       { fontSize: 11, color: MUTED, marginBottom: 2 },
  depotAddr:       { fontSize: 11, color: MUTED },
  depotKg:         { fontSize: 20, fontWeight: '800', color: GD },
  depotKgUnit:     { fontSize: 11, color: MUTED, textAlign: 'right' },
  depotStatutBadge:{ borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  depotStatutTxt:  { fontSize: 10, fontWeight: '700' },
  quickAction:     { backgroundColor: '#f0fdf4', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#e8f5e9' },
  quickActionUrgent:{ backgroundColor: '#fef9c3', borderTopColor: '#fde68a' },
  quickActionTxt:  { fontSize: 12, fontWeight: '700', color: GD },

  // FAB
  fabWrap: { position: 'absolute', bottom: 24, right: 20 },
  fab:     { backgroundColor: GD, borderRadius: 50, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: GD, shadowOffset:{width:0,height:6}, shadowOpacity:0.4, shadowRadius:12, elevation:10 },
  fabIcon: { color: '#fff', fontSize: 20, fontWeight: '800' },
  fabTxt:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Modal
  modalOverlay: { flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.5)' },
  modalSheet:   { backgroundColor: CREAM, borderTopLeftRadius:28, borderTopRightRadius:28, padding:20, maxHeight:'90%' },
  modalHandle:  { width:40, height:4, backgroundColor:SAND, borderRadius:2, alignSelf:'center', marginBottom:20 },
  modalHeader:  { flexDirection:'row', alignItems:'center', borderRadius:16, padding:16, marginBottom:16 },
  modalStatutTxt:{ fontSize:13, fontWeight:'700', marginBottom:2 },
  modalType:    { fontSize:17, fontWeight:'800', color:BROWN },
  modalKg:      { fontSize:28, fontWeight:'800', color:GD },

  // Infos
  infoGrid:  { backgroundColor:'#fff', borderRadius:16, padding:4, marginBottom:14 },
  infoRow:   { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:14, paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#f5efe6', gap:12 },
  infoIcon:  { fontSize:18, marginTop:2 },
  infoLbl:   { fontSize:11, color:MUTED, fontWeight:'600', marginBottom:2 },
  infoVal:   { fontSize:14, color:BROWN, fontWeight:'600' },

  // Production estimée modal
  prodEstCard:  { backgroundColor:'#f0fdf4', borderRadius:16, padding:16, marginBottom:16 },
  prodEstTitle: { fontSize:13, fontWeight:'700', color:'#15803d', marginBottom:12 },
  prodEstRow:   { flexDirection:'row', alignItems:'center' },
  prodEstItem:  { flex:1, alignItems:'center', gap:4 },
  prodEstEmoji: { fontSize:24 },
  prodEstVal:   { fontSize:16, fontWeight:'800', color:GD },
  prodEstLbl:   { fontSize:10, color:MUTED, fontWeight:'600' },
  prodEstDivider:{ width:1, height:50, backgroundColor:'#d1fae5' },

  // Changer statut
  changeStatutTitle: { fontSize:12, fontWeight:'700', color:MUTED, textTransform:'uppercase', letterSpacing:0.5, marginBottom:10 },
  changeStatutGrid:  { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:16 },
  changeStatutBtn:   { flexDirection:'row', alignItems:'center', gap:6, borderRadius:50, paddingHorizontal:14, paddingVertical:9, borderWidth:1.5 },
  changeStatutBtnTxt:{ fontSize:12, fontWeight:'700' },

  // Boutons modal
  modalBtns:    { flexDirection:'row', gap:10 },
  btnAnnuler:   { flex:1, padding:14, borderRadius:14, backgroundColor:'#fee2e2', alignItems:'center' },
  btnAnnulerTxt:{ color:'#dc2626', fontWeight:'700', fontSize:13 },
  btnFermer:    { flex:1, padding:14, borderRadius:14, backgroundColor:GD, alignItems:'center' },
  btnFermerTxt: { color:'#fff', fontWeight:'700', fontSize:14 },
});