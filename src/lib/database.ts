import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc, 
  getDoc,
  where,
  limit,
  serverTimestamp,
  getCountFromServer,
  type DocumentData,
  getDocFromServer
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

import { supabase, fetchRecursive, isSupabaseConfigured } from './supabase';

const app = initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId
});

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Helper to handle Errors
export interface DbErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
  }
}

export function handleFirestoreError(error: any, operation: any, path: string | null = null): never {
  const isQuotaError = 
    error.code === 'quota-exceeded' || 
    error.code === 'resource-exhausted' ||
    error.message?.toLowerCase().includes('quota exceeded') ||
    error.message?.toLowerCase().includes('resource-exhausted') ||
    error.message?.toLowerCase().includes('resource exhausted');

  if (isQuotaError) {
    isFirebaseQuotaExceeded = true;
  }

  const info: DbErrorInfo = {
    error: isQuotaError ? 'Firebase Quota Exceeded' : (error.message || 'Unknown error'),
    operationType: operation,
    path,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
    }
  };
  
  if (isQuotaError) {
    console.error(' [FIREBASE QUOTA] Limite diário atingido. O Firebase bloqueou novas leituras/escritas.');
  }

  throw new Error(JSON.stringify(info));
}

let isFirebaseQuotaExceeded = false;

// Configuração de Migração Progressiva
// Adicione o nome da coleção aqui após garantir que os dados foram sincronizados
// Tabelas nesta lista usarão EXCLUSIVAMENTE o Supabase.
export const MIGRATED_COLLECTIONS: string[] = [
  'institution_settings',
  'foraries',
  'parishes',
  'clergy_leity',
  'subjects',
  'teachers',
  'classes',
  'students',
  'attendances',
  'grades',
  'calendar_events',
  'contributions',
  'pix_reconciliations',
  'certificates',
  'users',
  'email_registry'
];

/**
 * Utility to fetch all data from a collection, prioritizing Supabase
 */
export const fetchAll = async (collectionName: string, select = '*', orderCol = 'created_at', ascending = false) => {
  const isMigrated = MIGRATED_COLLECTIONS.includes(collectionName);
  
  try {
    // 1. Try Supabase first (Primary)
    if (isSupabaseConfigured) {
      try {
        const sbData = await fetchRecursive(collectionName, { select, orderCol, ascending });
        // Se a tabela está migrada, confiamos no que está no Supabase (mesmo que vazio)
        if (isMigrated) {
          return sbData || [];
        }
        // Se não está migrada, só retornamos se tiver dados
        if (sbData && sbData.length > 0) {
          return sbData;
        }
      } catch (sbErr: any) {
        if (!sbErr.message?.includes('Could not find the table') && sbErr.code !== '42P01') {
          console.warn(`[Supabase] Erro ao buscar ${collectionName}:`, sbErr.message);
        }
        if (isMigrated) throw sbErr;
      }
    }

    // 2. Fallback to Firebase (Legacy)
    if (isMigrated || isFirebaseQuotaExceeded) {
      return [];
    }

    const colRef = collection(db, collectionName);
    const q = query(colRef, orderBy(orderCol || 'created_at', ascending ? 'asc' : 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  } catch (err: any) {
    if (err.code === 'quota-exceeded' || err.message?.includes('quota')) {
      isFirebaseQuotaExceeded = true;
    }
    return handleFirestoreError(err, 'list', collectionName);
  }
};

/**
 * Utility to fetch a single document (Prioritizes Supabase)
 */
export const fetchById = async (collectionName: string, id: string) => {
  if (!id) return null;
  const isMigrated = MIGRATED_COLLECTIONS.includes(collectionName);

  try {
    // 1. Try Supabase first (Primary)
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from(collectionName)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) return data;
      if (isMigrated && !error) return null; // Registro não existe no Supabase e a tabela já foi migrada
    }

    // 2. Fallback to Firebase (Legacy)
    if (isMigrated || isFirebaseQuotaExceeded) return null;

    const docRef = doc(db, collectionName, id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() };
    }
    return null;
  } catch (err: any) {
    return handleFirestoreError(err, 'get', `${collectionName}/${id}`);
  }
};

/**
 * Utility to fetch documents with a query (Prioritizes Supabase)
 */
export const fetchQuery = async (collectionName: string, field: string, operator: string, value: any) => {
  try {
    // 1. Try Supabase first (Primary)
    if (isSupabaseConfigured) {
      let queryBuilder = supabase.from(collectionName).select('*');
      
      if (operator === '==' || operator === 'eq') queryBuilder = queryBuilder.eq(field, value);
      else if (operator === '>=') queryBuilder = queryBuilder.gte(field, value);
      else if (operator === '<=') queryBuilder = queryBuilder.lte(field, value);
      else if (operator === 'in') queryBuilder = queryBuilder.in(field, value);
      
      const { data, error } = await queryBuilder;
      if (!error && data && data.length > 0) return data;
    }

    // 2. Fallback to Firebase
    const colRef = collection(db, collectionName);
    const q = query(colRef, where(field, operator === 'eq' ? '==' : (operator as any), value));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err: any) {
    return [];
  }
};

/**
 * Count utility
 */
export const fetchCount = async (collectionName: string, status?: string) => {
  const isMigrated = MIGRATED_COLLECTIONS.includes(collectionName);
  try {
    // 1. Try Supabase
    if (isSupabaseConfigured) {
      let q = supabase.from(collectionName).select('*', { count: 'exact', head: true });
      if (status) q = q.eq('status', status);
      const { count } = await q;
      
      // Se está migrada, confiamos no count do Supabase mesmo que 0
      if (isMigrated && count !== null) return count;
      // Se não está migrada, só retornamos se tiver registros
      if (count !== null && count > 0) return count;
    }

    // 2. Fallback to Firebase se o Supabase estiver zerado/não migrado
    if (isMigrated || isFirebaseQuotaExceeded) return 0;

    const colRef = collection(db, collectionName);
    let q = query(colRef);
    if (status) q = query(colRef, where('status', '==', status));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (err: any) {
    return 0;
  }
};

/**
 * Double-write pattern to start migration
 */
export const saveData = async (collectionName: string, id: string | undefined, data: any) => {
  const finalId = id || data.id || crypto.randomUUID();
  const payload = { ...data, id: finalId };
  const isMigrated = MIGRATED_COLLECTIONS.includes(collectionName);

  try {
    // 1. Save to Supabase (Primary)
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from(collectionName).upsert(payload);
        if (error) {
          console.warn(`[Supabase Error] Collection: ${collectionName} | ID: ${finalId} | Message: ${error.message}`);
          if (error.message.includes('column') && error.message.includes('not exist')) {
            console.error('DICA: Você precisa adicionar as novas colunas ao Supabase usando o SQL Editor.');
          }
          if (error.message.includes('foreign key constraint')) {
            throw new Error(`Dependência não encontrada: ${error.message}`);
          }
          // Se falhar e a tabela for migrada, o erro é fatal
          if (isMigrated) throw error;
        }
      } catch (sbErr: any) {
        if (sbErr.message?.includes('Dependência')) throw sbErr;
        console.error(`[Supabase Critical] ${collectionName}:`, sbErr.message);
        if (isMigrated) throw sbErr;
      }
    }

    // 2. Mirror to Firebase (Secondary/Legacy)
    // Se a tabela já foi migrada, não escrevemos mais no Firebase
    if (db && !isMigrated && !isFirebaseQuotaExceeded) {
      const firestoreData = { ...payload };
      delete (firestoreData as any).id;
      await setDoc(doc(db, collectionName, finalId), firestoreData, { merge: true });
    }

    return finalId;
  } catch (err: any) {
    console.error(`[saveData] Erro fatal em "${collectionName}":`, err.message);
    throw err;
  }
};

/**
 * Delete from both
 */
export const deleteData = async (collectionName: string, id: string) => {
  if (!id) return;
  const isMigrated = MIGRATED_COLLECTIONS.includes(collectionName);
  
  try {
    // 1. Delete from Supabase
    if (isSupabaseConfigured) {
      const { error } = await supabase.from(collectionName).delete().eq('id', id);
      if (error && isMigrated) throw error;
    }
    
    // 2. Delete from Firebase (Legacy)
    if (db && !isMigrated && !isFirebaseQuotaExceeded) {
      await deleteDoc(doc(db, collectionName, id));
    }
  } catch (err: any) {
    console.error(`[deleteData] Erro em "${collectionName}":`, err.message);
    if (isMigrated) throw err;
  }
};

export const uploadImage = async (file: File, bucketName: string, path: string): Promise<string> => {
  // Mantemos o storage do Firebase por enquanto pois Buckets do Supabase requerem mais config
  try {
    const filePath = `${path}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, filePath);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  } catch (error: any) {
    return "";
  }
};

/**
 * Direct fetch from Firebase (for migration sync)
 */
export const fetchFromFirestore = async (collectionName: string) => {
  try {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err: any) {
    console.error(`Error fetching from Firestore (${collectionName}):`, err.message);
    return handleFirestoreError(err, 'list', collectionName);
  }
};
