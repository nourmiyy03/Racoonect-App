import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL  = 'https://jlwpqyzjxpapzkodmofc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impsd3BxeXpqeHBhcHprb2Rtb2ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NjczMDcsImV4cCI6MjA4OTE0MzMwN30.5Fr2xBgjDFvOrh8p37brvNKa_FfkNup_ihIVC7Zv0R0';

// Utilise expo-secure-store à la place d'AsyncStorage
// Plus fiable avec Expo Go sur Android
const ExpoSecureStoreAdapter = {
  getItem:    (key: string) => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});