import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, SafeAreaView, StatusBar, RefreshControl, Modal,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { router } from 'expo-router';

// ── Types ──────────────────────────────────────────────────────
type Statut = 'en_attente' | 'planifie' | 'collecte' | 'traitement' | 'annule';

interface Dechet {
  id: string;
  type_dechet: string;
  quantite_kg: number;
  adresse: string;
  statut: Statut;
  date_demande: string;
  notes?: string;
}

const STATUT_CONFIG: Record<Statut, { label: string; color: string; bg: string; emoji: string }> = {
  en_attente: { label: 'En attente',    color: '#c47d00', bg: '#fff3e0', emoji: '⏳' },
  planifie:   { label: 'Planifié',      color: '#1565c0', bg: '#e3f2fd', emoji: '📅' },
  collecte:   { label: 'Collecté',      color: '#2e7d32', bg: '#e8f5e9', emoji: '✅' },
  traitement: { label: 'En traitement', color: '#6a1b9a', bg: '#f3e5f5', emoji: '⚙️' },
  annule:     { label: 'Annulé',        color: '#c62828', bg: '#ffebee', emoji: '❌' },
};

const TYPES_DECHETS = [
  '🌾 Paille de blé', '🌽 Tiges de maïs', '🫒 Marc d\'olive',
  '🐄 Fumier bovin',  '🐑 Fumier ovin',   '🍃 Déchets végétaux',
  '🌿 Feuilles sèches', '🪵 Résidus de taille',
];

const STEPS: Statut[] = ['en_attente', 'planifie', 'collecte', 'traitement'];

export default function FournisseurDashboard() {
  const [profile,    setProfile]    = useState<{ nom: string; prenom: string } | null>(null);
  const [dechets,    setDechets]    = useState<Dechet[]>([]);
  const [totalMois,  setTotalMois]  = useState(0);
  const [totalGlob,  setTotalGlob]  = useState(0);
  const [nbCollecte, setNbCollecte] = useState(0);
  const [nbAttente,  setNbAttente]  = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal,  setShowModal]  = useState(false);

  // Formulaire
  const [typeDechet, setTypeDechet] = useState('');
  const [quantite,   setQuantite]   = useState('');
  const [adresse,    setAdresse]    = useState('');
  const [notes,      setNotes]      = useState('');
  const [formError,  setFormError]  = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showTypes,  setShowTypes]  = useState(false);

  // Animations
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  const anim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadData();
    Animated.stagger(160, [
      Animated.timing(anim1, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(anim2, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(anim3, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/(auth)/login'); return; }

    const { data: prof } = await supabase.from('profiles').select('nom, prenom').eq('id', user.id).single();
    if (prof) setProfile(prof);

    const { data: dec } = await supabase
      .from('dechets').select('*')
      .eq('fournisseur_id', user.id)
      .order('date_demande', { ascending: false });

    if (dec) {
      setDechets(dec);
      const now = new Date();
      const debut = new Date(now.getFullYear(), now.getMonth(), 1);
      setTotalMois(dec.filter(d => new Date(d.date_demande) >= debut && d.statut !== 'annule').reduce((s, d) => s + d.quantite_kg, 0));
      setTotalGlob(dec.filter(d => d.statut !== 'annule').reduce((s, d) => s + d.quantite_kg, 0));
      setNbCollecte(dec.filter(d => d.statut === 'collecte' || d.statut === 'traitement').length);
      setNbAttente(dec.filter(d => d.statut === 'en_attente').length);
    }
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  async function handleDeclarer() {
    setFormError('');
    if (!typeDechet)                              { setFormError('Sélectionnez un type de déchet.'); return; }
    if (!quantite || Number(quantite) <= 0)       { setFormError('Entrez une quantité valide en kg.'); return; }
    if (!adresse.trim())                          { setFormError('Entrez l\'adresse de collecte.'); return; }

    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('dechets').insert({
      fournisseur_id: user!.id,
      type_dechet:    typeDechet.replace(/^\S+\s/, ''),
      quantite_kg:    Number(quantite),
      adresse:        adresse.trim(),
      notes:          notes.trim() || null,
      statut:         'en_attente',
    });
    setSubmitting(false);
    if (error) { setFormError('Erreur: ' + error.message); return; }
    setTypeDechet(''); setQuantite(''); setAdresse(''); setNotes('');
    setShowModal(false);
    loadData();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  const fs = (a: Animated.Value) => ({
    opacity: a,
    transform: [{ translateY: a.interpolate({ inputRange: [0,1], outputRange: [20,0] }) }],
  });

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={GD} />
      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GM} />}
      >

        {/* ══ HEADER ══════════════════════════════════════════ */}
        <Animated.View style={[s.header, fs(anim1)]}>
          <View>
            <Text style={s.hHello}>Bonjour 👋</Text>
            <Text style={s.hName}>{profile ? `${profile.prenom || ''} ${profile.nom}`.trim() : '...'}</Text>
            <View style={s.roleBadge}><Text style={s.roleText}>🚜 Fournisseur de déchets</Text></View>
          </View>
          <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
            <Text style={s.logoutIcon}>↩</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ══ CARTE STAT PRINCIPALE ═══════════════════════════ */}
        <Animated.View style={fs(anim2)}>
          <View style={s.mainCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.mainLabel}>Fournis ce mois-ci</Text>
              <Text style={s.mainValue}>{totalMois.toFixed(0)} kg</Text>
              <Text style={s.mainSub}>Total cumulé : {totalGlob.toFixed(0)} kg</Text>
            </View>
            <Text style={s.mainEmoji}>🌾</Text>
          </View>

          {/* 3 mini stats */}
          <View style={s.miniRow}>
            <View style={s.mini}>
              <Text style={s.miniEmoji}>✅</Text>
              <Text style={s.miniVal}>{nbCollecte}</Text>
              <Text style={s.miniLbl}>Collectés</Text>
            </View>
            <View style={[s.mini, s.miniMid]}>
              <Text style={s.miniEmoji}>⏳</Text>
              <Text style={s.miniVal}>{nbAttente}</Text>
              <Text style={s.miniLbl}>En attente</Text>
            </View>
            <View style={s.mini}>
              <Text style={s.miniEmoji}>🌱</Text>
              <Text style={s.miniVal}>{(totalGlob * 0.3).toFixed(0)} kg</Text>
              <Text style={s.miniLbl}>Fertilisant</Text>
            </View>
          </View>
        </Animated.View>

        {/* ══ BOUTON DÉCLARER ═════════════════════════════════ */}
        <Animated.View style={[s.declareWrap, fs(anim3)]}>
          <TouchableOpacity style={s.declareBtn} onPress={() => setShowModal(true)} activeOpacity={0.85}>
            <Text style={s.declarePlus}>＋</Text>
            <Text style={s.declareTxt}>Déclarer un nouveau dépôt</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ══ LISTE DÉPÔTS ════════════════════════════════════ */}
        <Animated.View style={fs(anim3)}>
          <View style={s.secHeader}>
            <Text style={s.secTitle}>Mes dépôts</Text>
            {dechets.length > 0 && (
              <View style={s.badge}><Text style={s.badgeTxt}>{dechets.length}</Text></View>
            )}
          </View>

          {loading
            ? <ActivityIndicator color={GM} style={{ marginTop: 40 }} />
            : dechets.length === 0
            ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>🌱</Text>
                <Text style={s.emptyTitle}>Aucun dépôt encore</Text>
                <Text style={s.emptySub}>Déclarez votre premier dépôt de déchets agricoles</Text>
              </View>
            ) : dechets.map(d => {
              const sc = STATUT_CONFIG[d.statut];
              const cur = STEPS.indexOf(d.statut);
              return (
                <View key={d.id} style={s.card}>
                  <View style={s.cardTop}>
                    <View style={[s.statBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[s.statTxt, { color: sc.color }]}>{sc.emoji} {sc.label}</Text>
                    </View>
                    <Text style={s.cardDate}>
                      {new Date(d.date_demande).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </Text>
                  </View>
                  <View style={s.cardMain}>
                    <Text style={s.cardType}>{d.type_dechet}</Text>
                    <Text style={s.cardKg}>{d.quantite_kg} kg</Text>
                  </View>
                  <Text style={s.cardAddr} numberOfLines={1}>📍 {d.adresse}</Text>

                  {/* Barre de progression */}
                  <View style={s.progRow}>
                    {STEPS.map((st, i) => (
                      <View key={st} style={s.progStep}>
                        <View style={[s.progDot, i <= cur && s.progDotOn]} />
                        {i < STEPS.length - 1 && <View style={[s.progLine, i < cur && s.progLineOn]} />}
                      </View>
                    ))}
                  </View>
                  <View style={s.progLbls}>
                    {['Déclaré','Planifié','Collecté','Traitement'].map(l => (
                      <Text key={l} style={s.progLbl}>{l}</Text>
                    ))}
                  </View>
                  {d.notes ? <Text style={s.cardNote}>💬 {d.notes}</Text> : null}
                </View>
              );
            })
          }
          <View style={{ height: 40 }} />
        </Animated.View>

      </ScrollView>

      {/* ══ MODAL FORMULAIRE ════════════════════════════════ */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={s.modalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>🌾 Nouveau dépôt</Text>
              <Text style={s.modalSub}>Déclarez vos déchets agricoles pour collecte</Text>

              <Text style={s.lbl}>Type de déchet *</Text>
              <TouchableOpacity style={[s.input, s.selectRow]} onPress={() => setShowTypes(!showTypes)}>
                <Text style={typeDechet ? s.selectVal : s.selectPh}>{typeDechet || 'Sélectionner...'}</Text>
                <Text style={{ color: MUTED }}>{showTypes ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showTypes && (
                <View style={s.typeList}>
                  {TYPES_DECHETS.map(t => (
                    <TouchableOpacity key={t} style={[s.typeOpt, typeDechet === t && s.typeOptOn]}
                      onPress={() => { setTypeDechet(t); setShowTypes(false); setFormError(''); }}>
                      <Text style={[s.typeOptTxt, typeDechet === t && s.typeOptTxtOn]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={s.lbl}>Quantité estimée (kg) *</Text>
              <TextInput style={s.input} placeholder="Ex : 500" placeholderTextColor="#a89880"
                keyboardType="numeric" value={quantite} onChangeText={t => { setQuantite(t); setFormError(''); }} />

              <Text style={s.lbl}>Adresse de collecte *</Text>
              <TextInput style={s.input} placeholder="Ex : Ferme Benali, Route N1, Meknès"
                placeholderTextColor="#a89880" value={adresse} onChangeText={t => { setAdresse(t); setFormError(''); }} />

              <Text style={s.lbl}>Notes (optionnel)</Text>
              <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Informations supplémentaires..." placeholderTextColor="#a89880"
                multiline value={notes} onChangeText={setNotes} />

              {formError !== '' && <Text style={s.err}>{formError}</Text>}

              <View style={s.mBtns}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowModal(false); setFormError(''); }}>
                  <Text style={s.cancelTxt}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.7 }]}
                  onPress={handleDeclarer} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitTxt}>Envoyer →</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const GD = '#3a6b35'; const GM = '#5a8f4e';
const BROWN = '#5c3d1e'; const CREAM = '#faf6f0';
const SAND = '#e8dcc8'; const MUTED = '#8a7560';

const s = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: GD },
  scroll:{ flex: 1, backgroundColor: '#f5f0e8' },
  header:{ backgroundColor: GD, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hHello:{ color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  hName: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6, alignSelf: 'flex-start' },
  roleText:  { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600' },
  logoutBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  logoutIcon:{ color: '#fff', fontSize: 18 },
  mainCard:  { margin: 16, marginTop: -14, backgroundColor: '#fff', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.08, shadowRadius:12, elevation:5 },
  mainLabel: { fontSize: 12, color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  mainValue: { fontSize: 36, fontWeight: '800', color: GD, marginVertical: 4 },
  mainSub:   { fontSize: 12, color: MUTED },
  mainEmoji: { fontSize: 48, opacity: 0.25 },
  miniRow:   { flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 8 },
  mini:      { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.05, shadowRadius:6, elevation:2 },
  miniMid:   { borderWidth: 1.5, borderColor: SAND },
  miniEmoji: { fontSize: 22, marginBottom: 4 },
  miniVal:   { fontSize: 18, fontWeight: '800', color: BROWN },
  miniLbl:   { fontSize: 10, color: MUTED, marginTop: 2 },
  declareWrap:{ marginHorizontal: 16, marginVertical: 12 },
  declareBtn: { backgroundColor: GD, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: GD, shadowOffset:{width:0,height:6}, shadowOpacity:0.3, shadowRadius:12, elevation:8 },
  declarePlus:{ color: '#fff', fontSize: 22 },
  declareTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secHeader:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  secTitle:   { fontSize: 16, fontWeight: '800', color: BROWN },
  badge:      { backgroundColor: GD, borderRadius: 50, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  badgeTxt:   { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty:      { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: BROWN, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 20 },
  card:       { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 18, padding: 16, shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statBadge:  { borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4 },
  statTxt:    { fontSize: 12, fontWeight: '700' },
  cardDate:   { fontSize: 12, color: MUTED },
  cardMain:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardType:   { fontSize: 15, fontWeight: '700', color: BROWN },
  cardKg:     { fontSize: 16, fontWeight: '800', color: GD },
  cardAddr:   { fontSize: 12, color: MUTED, marginBottom: 12 },
  cardNote:   { fontSize: 12, color: MUTED, marginTop: 8, fontStyle: 'italic' },
  progRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  progStep:   { flex: 1, flexDirection: 'row', alignItems: 'center' },
  progDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e0d5c5' },
  progDotOn:  { backgroundColor: GD },
  progLine:   { flex: 1, height: 2, backgroundColor: '#e0d5c5' },
  progLineOn: { backgroundColor: GM },
  progLbls:   { flexDirection: 'row', justifyContent: 'space-between' },
  progLbl:    { fontSize: 9, color: MUTED, flex: 1, textAlign: 'center' },
  modalBg:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: CREAM, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '92%' },
  modalHandle:{ width: 40, height: 4, backgroundColor: SAND, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: BROWN, marginBottom: 4 },
  modalSub:   { fontSize: 13, color: MUTED, marginBottom: 20 },
  lbl:        { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input:      { backgroundColor: '#fff', borderWidth: 1.5, borderColor: SAND, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: BROWN, marginBottom: 14 },
  selectRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectVal:  { color: BROWN, fontSize: 15 },
  selectPh:   { color: '#a89880', fontSize: 15 },
  typeList:   { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: SAND, marginBottom: 14, overflow: 'hidden' },
  typeOpt:    { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0e8da' },
  typeOptOn:  { backgroundColor: '#e8f0e5' },
  typeOptTxt: { fontSize: 14, color: BROWN },
  typeOptTxtOn:{ fontWeight: '700', color: GD },
  err:        { color: '#c0392b', fontSize: 12, marginBottom: 10, textAlign: 'center', fontWeight: '500' },
  mBtns:      { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn:  { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#ede8df', alignItems: 'center' },
  cancelTxt:  { color: MUTED, fontWeight: '700', fontSize: 14 },
  submitBtn:  { flex: 2, padding: 14, borderRadius: 12, backgroundColor: GD, alignItems: 'center' },
  submitTxt:  { color: '#fff', fontWeight: '700', fontSize: 14 },
});