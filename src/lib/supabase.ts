import { createClient } from '@supabase/supabase-js';

const getEnv = (name: string): string | undefined => {
  try {
    // Try Vite way
    const viteEnv = (import.meta as any).env?.[name];
    if (viteEnv) return viteEnv;
    
    // Try process.env way (fallback)
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
  } catch (e) {
    // Ignore errors
  }
  return undefined;
};

const rawUrl = getEnv('VITE_SUPABASE_URL');
const rawKey = getEnv('VITE_SUPABASE_ANON_KEY');

// Ensure we have a valid-looking URL string for the client initialization
// even if the user hasn't provided one yet.
const finalUrl = (rawUrl && rawUrl.trim().startsWith('http')) 
  ? rawUrl.trim() 
  : 'https://placeholder-project.supabase.co';

const finalKey = (rawKey && rawKey.trim()) 
  ? rawKey.trim() 
  : 'placeholder-key';

if (!rawUrl || !rawKey) {
  console.warn(
    'Supabase credentials missing or invalid. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the Secrets panel.'
  );
}

export const supabase = createClient(finalUrl, finalKey);

/**
 * Helper to fetch ALL records from a table, bypassing the 1000 records limit.
 */
export const fetchAll = async (tableName: string, selectFields = '*', orderCol = 'created_at', ascending = false) => {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName as any)
      .select(selectFields)
      .order(orderCol, { ascending })
      .range(from, from + step - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < step) {
        hasMore = false;
      } else {
        from += step;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
};

/**
 * Helper to upload an image to Supabase Storage with a fallback to Base64
 */
export const uploadImage = async (file: File, bucket: string, path: string): Promise<string> => {
  try {
    // 1. Ensure bucket exists (optional, might fail if no permissions)
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.find(b => b.name === bucket)) {
        await supabase.storage.createBucket(bucket, { public: true });
      }
    } catch (e) {
      console.warn('Bucket check failed, proceeding with upload...');
    }

    // 2. Prepare file
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
    const filePath = `${path}/${fileName}`;

    // 3. Upload
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // 4. Get URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error: any) {
    console.error('Storage upload failed, falling back to Base64:', error.message);
    
    // Fallback to Base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(error);
      reader.readAsDataURL(file);
    });
  }
};
