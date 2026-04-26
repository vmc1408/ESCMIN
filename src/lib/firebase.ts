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

// Helper to handle Firestore Errors
export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
    emailVerified: boolean;
    isAnonymous: boolean;
  }
}

export function handleFirestoreError(error: any, operation: any, path: string | null = null): never {
  const info: FirestoreErrorInfo = {
    error: error.message || 'Unknown error',
    operationType: operation,
    path,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false
    }
  };
  throw new Error(JSON.stringify(info));
}

/**
 * Validates connection to Firestore with a lightweight check
 */
let isOnline = false;
async function testConnection() {
  if (isOnline) return;
  try {
    // Try Supabase first if configured
    if (isSupabaseConfigured) {
      const { error: sbError } = await supabase.from('institution_settings').select('id').limit(1);
      if (!sbError) {
        isOnline = true;
        console.log('Database Connection (Supabase) Active');
        return;
      }
    }

    const colRef = collection(db, 'institution_settings');
    await getCountFromServer(query(colRef, limit(1)));
    isOnline = true;
  } catch (error: any) {
    if (error.message && error.message.includes('quota')) {
      console.warn("Firebase Quota Exceeded. System operating in Hybrid/Supabase mode.");
      // We don't mark as offline because we might have Supabase working
      isOnline = true; 
    }
  }
}
testConnection();

/**
 * Utility to fetch all data from a collection, merging Supabase and Firebase
 */
export const fetchAll = async (collectionName: string, select = '*', orderCol = 'created_at', ascending = false) => {
  const allItemsMap = new Map<string, any>();

  try {
    // 1. Try Supabase first if configured
    if (isSupabaseConfigured) {
      try {
        const sbData = await fetchRecursive(collectionName, { select, orderCol, ascending });
        if (sbData && sbData.length > 0) {
          sbData.forEach(item => {
            if (item.id !== undefined && item.id !== null) {
              const idStr = String(item.id);
              allItemsMap.set(idStr, { ...item, id: idStr });
            }
          });
        }
      } catch (sbErr: any) {
        if (!sbErr.message?.includes('Could not find the table')) {
          console.warn(`[Supabase] Erro ao buscar ${collectionName}:`, sbErr.message);
        }
      }
    }

    // 2. Fetch from Firebase
    try {
      const colRef = collection(db, collectionName);
      // Removed orderBy to prevent excluding documents with missing fields (Firestore behavior)
      const q = query(colRef);
      const snapshot = await getDocs(q);
      snapshot.docs.forEach(doc => {
        const idStr = String(doc.id);
        const fbData = doc.data();
        const data = { ...fbData, id: idStr };
        
        let existingKey = idStr;
        
        // Deduplication strategy: if item has a 'code', check if we already have it under a different ID
        if (fbData.code) {
          const itemWithSameCode = Array.from(allItemsMap.entries()).find(([_, item]) => item.code === fbData.code);
          if (itemWithSameCode) {
            existingKey = itemWithSameCode[0];
          }
        }

        const existing = allItemsMap.get(existingKey);
        if (existing) {
          // Merge prioritizing Firebase (data) over Supabase (existing)
          const merged = { ...existing, ...data };
          allItemsMap.set(existingKey, merged);
        } else {
          allItemsMap.set(idStr, data);
        }
      });
    } catch (fErr: any) {
      if (fErr.message && fErr.message.includes('quota')) {
        console.warn(`Firestore quota reached for ${collectionName} list.`);
      } else {
        console.error(`Firebase error fetching ${collectionName}:`, fErr);
      }
    }

    const mergedData = Array.from(allItemsMap.values());
    
    // Re-sort because merged data might be out of order
    return mergedData.sort((a, b) => {
      const valA = a[orderCol] || '';
      const valB = b[orderCol] || '';
      return ascending ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

  } catch (err: any) {
    return handleFirestoreError(err, 'list', collectionName);
  }
};

/**
 * Utility to fetch specifically from Firestore (useful for migrations/backups)
 */
export const fetchFromFirestore = async (collectionName: string, orderCol = 'created_at', ascending = false) => {
  try {
    const colRef = collection(db, collectionName);
    const q = query(colRef, orderBy(orderCol || 'created_at', ascending ? 'asc' : 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err: any) {
    console.error(`Error fetching from Firestore (${collectionName}):`, err);
    return [];
  }
};

/**
 * Utility to fetch a single document by ID (Prioritizes Supabase)
 */
export const fetchById = async (collectionName: string, id: string) => {
  if (!id) return null;
  
  try {
    // 1. Try Supabase first if configured
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from(collectionName)
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          return data;
        }
      } catch (sbErr: any) {
        if (!sbErr.message?.includes('Could not find the table') && sbErr.code !== '42P01') {
          console.warn(`[Supabase] Erro ao buscar ${collectionName}/${id}:`, sbErr.message);
        }
      }
    }

    // 2. Fallback to Firebase
    const docRef = doc(db, collectionName, id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() };
    }
    return null;
  } catch (err: any) {
    if (err.message && err.message.includes('quota')) {
      return null;
    }
    return handleFirestoreError(err, 'get', `${collectionName}/${id}`);
  }
};

/**
 * Utility to fetch documents with a simple where filter (Prioritizes Supabase)
 */
export const fetchQuery = async (collectionName: string, field: string, operator: any, value: any) => {
  try {
    // 1. Try Supabase first if configured
    if (isSupabaseConfigured) {
      try {
        let queryBuilder = supabase.from(collectionName).select('*');
        if (operator === '==' || operator === 'eq') {
          queryBuilder = queryBuilder.eq(field, value);
        } else if (operator === 'in') {
          queryBuilder = queryBuilder.in(field, value);
        } else {
          // If operator not supported easily in this helper, skip Supabase
          throw new Error("Operator not supported in Supabase helper");
        }
        
        const { data, error } = await queryBuilder;
        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (sbErr: any) {
        if (!sbErr.message?.includes('Could not find the table') && sbErr.code !== '42P01') {
          console.warn(`[Supabase] Erro na query ${collectionName}:`, sbErr.message);
        }
      }
    }

    // 2. Fallback to Firebase
    const colRef = collection(db, collectionName);
    const q = query(colRef, where(field, operator === 'eq' ? '==' : operator, value));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err: any) {
    if (err.message && err.message.includes('quota')) {
      return [];
    }
    return handleFirestoreError(err, 'list', collectionName);
  }
};

/**
 * Highly efficient count utility (Prioritizes Supabase to save Firestore quota)
 */
export const fetchCount = async (collectionName: string, status?: string) => {
  try {
    // 1. Try Supabase first if configured
    if (isSupabaseConfigured) {
      try {
        let queryBuilder = supabase
          .from(collectionName)
          .select('*', { count: 'exact', head: true });

        if (status) {
          if (status === 'Ativo') {
            // Business logic: Active includes explicitly 'Ativo', null OR empty string
            queryBuilder = queryBuilder.or(`status.eq.Ativo,status.is.null,status.eq.""`);
          } else {
            queryBuilder = queryBuilder.eq('status', status);
          }
        }

        const { count, error } = await queryBuilder;
        if (error) throw error;

        if (count !== null) {
          return count;
        }
      } catch (sbErr: any) {
        if (!sbErr.message?.includes('Could not find the table') && sbErr.code !== '42P01') {
          console.warn(`[Supabase] Erro ao contar ${collectionName}, tentando Firebase:`, sbErr?.message);
        }
      }
    }

    // 2. Fallback to Firebase
    const colRef = collection(db, collectionName);
    let q = query(colRef);
    if (status) {
      q = query(colRef, where('status', '==', status));
    }
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (err: any) {
    if (err.message && err.message.includes('quota')) {
       console.warn(`Firestore quota reached for ${collectionName}. Returning cached/local 0.`);
    } else {
       console.error(`Count error for ${collectionName}:`, err);
    }
    return 0;
  }
};

/**
 * Synchronous save to both Supabase and Firebase (handles IDs correctly)
 * This avoids the "No document to update" error by using setDoc with merge: true.
 */
export const saveData = async (collectionName: string, id: string | undefined, data: any) => {
  const effectiveId = id || data.id;
  
  try {
    let finalId = effectiveId;
    
    // Clean data for Supabase (remove id from body to avoid conflict)
    const { id: _, ...body } = data;
    
    // 1. Save to Supabase if configured
    let payload = { 
      ...(effectiveId ? { id: effectiveId } : {}), 
      ...body
    };

    if (isSupabaseConfigured) {
      try {
        let { data: sbData, error: sbError } = await supabase
          .from(collectionName)
          .upsert(payload)
          .select('id')
          .single();

        // Handle missing columns automatically (Schema Cache errors)
        let retryCount = 0;
        while (sbError && sbError.message.includes("Could not find the") && sbError.message.includes("column") && retryCount < 5) {
          console.warn(`[Supabase] Column missing, filtering and retrying (${retryCount + 1}): ${sbError.message}`);
          
          const match = sbError.message.match(/find the '([^']+)' column/);
          if (match && match[1]) {
            const missingColumn = match[1];
            delete (payload as any)[missingColumn];
            
            const retry = await supabase
              .from(collectionName)
              .upsert(payload)
              .select('id')
              .single();
              
            sbData = retry.data;
            sbError = retry.error;
            retryCount++;
          } else {
            break;
          }
        }

        if (!sbError && sbData && sbData.id) {
          finalId = sbData.id;
        } else if (sbError) {
          throw sbError;
        }
      } catch (sbErr: any) {
        if (!sbErr.message?.includes('Could not find the table') && sbErr.code !== '42P01') {
          console.warn(`[Supabase] Erro ao salvar em ${collectionName}. Continuando com Firebase.`);
        }
      }
    }

    // 2. Mirror to Firebase (Secondary Source/Cache)
    if (db && finalId) {
      try {
        const firestoreData = JSON.parse(JSON.stringify(body));
        await setDoc(doc(db, collectionName, finalId), {
          ...firestoreData,
          id: finalId // Ensure ID is present in Firebase for easier mapping
        }, { merge: true });
      } catch (fError: any) {
        if (fError.message && fError.message.includes('quota')) {
           // Silent warning for quota
        } else {
          console.error(`[Firebase] Erro no espelhamento:`, fError);
        }
      }
    }

    return finalId;
  } catch (err: any) {
    console.error(`[saveData] Erro fatal em "${collectionName}":`, err.message);
    throw err;
  }
};

/**
 * Synchronous delete from both Supabase and Firebase
 */
export const deleteData = async (collectionName: string, id: string, secondaryId?: string) => {
  if (!id) throw new Error("ID é obrigatório para exclusão.");

  console.log(`[deleteData] Tentando excluir ${id} ${secondaryId ? `e ${secondaryId}` : ''} de ${collectionName}...`);

  try {
    let sbDeleted = false;
    let fbDeleted = false;

    // 1. Delete from Supabase if configured
    if (isSupabaseConfigured) {
      try {
        const { error: sbError } = await supabase
          .from(collectionName)
          .delete()
          .eq('id', id);

        if (sbError) {
          console.warn(`[Supabase] Erro ao excluir ${id} de ${collectionName}:`, sbError.message);
        } else {
          console.log(`[Supabase] Exclusão de ${id} em ${collectionName} concluída.`);
          sbDeleted = true;
        }

        if (secondaryId) {
          await supabase.from(collectionName).delete().eq('id', secondaryId);
        }
      } catch (sbErr: any) {
        console.warn(`[Supabase] Erro fatal na exclusão de ${collectionName}:`, sbErr.message);
      }
    }

    // 2. Delete from Firebase
    if (db) {
      try {
        await deleteDoc(doc(db, collectionName, id));
        console.log(`[Firebase] Exclusão de ${id} em ${collectionName} concluída.`);
        if (secondaryId) {
           await deleteDoc(doc(db, collectionName, secondaryId));
           console.log(`[Firebase] Exclusão de ${secondaryId} em ${collectionName} concluída.`);
        }
        fbDeleted = true;
      } catch (fError: any) {
        if (fError.message && fError.message.includes('quota')) {
           console.warn(`[Firebase] Quota atingida na exclusão de ${collectionName}.`);
        } else {
          console.error(`[Firebase] Erro na exclusão:`, fError);
          throw fError; // Re-throw to inform UI of Firebase failure
        }
      }
    }

    return sbDeleted || fbDeleted;
  } catch (err: any) {
    if (err.message?.includes('Missing or insufficient permissions')) {
      return handleFirestoreError(err, 'delete', `${collectionName}/${id}`);
    }
    console.error(`[deleteData] Erro fatal em "${collectionName}" para ID ${id}:`, err.message);
    throw err;
  }
};

export const uploadImage = async (file: File, bucketName: string, path: string): Promise<string> => {
  // Promessa de Fallback (Base64)
  const getBase64Fallback = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(new Error('Falha ao processar arquivo localmente'));
      reader.readAsDataURL(file);
    });
  };

  try {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
    const filePath = `${path}/${fileName}`;
    const storageRef = ref(storage, filePath);
    
    // Timeout for Firebase (8 seconds)
    const uploadPromise = (async () => {
      const snapshot = await uploadBytes(storageRef, file);
      return await getDownloadURL(snapshot.ref);
    })();

    const timeoutPromise = new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), 8000)
    );

    try {
      return await Promise.race([uploadPromise, timeoutPromise]);
    } catch (e: any) {
      if (e.message === 'TIMEOUT') {
        return await getBase64Fallback();
      }
      throw e;
    }
  } catch (error: any) {
    return await getBase64Fallback();
  }
};
