import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App & Auth
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Cache token in memory only
let cachedAccessToken: string | null = null;

export function setCachedToken(token: string | null) {
  cachedAccessToken = token;
}

export function getCachedToken(): string | null {
  return cachedAccessToken;
}

/**
 * Executes a Google Sign In with Popup, requesting Drive permissions
 */
export async function signInWithGoogle(): Promise<{ user: User; accessToken: string }> {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Não foi possível obter o token de acesso do Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign In Error:', error);
    if (
      error?.code === 'auth/popup-closed-by-user' || 
      error?.code === 'auth/cancelled-popup-request' ||
      error?.message?.includes('popup')
    ) {
      throw new Error(
        'A janela de autenticação foi fechada ou bloqueada pelo navegador. Se você estiver na visualização do AI Studio, as regras de segurança impedem popups em iframes. Por favor, clique no botão "Abrir em Nova Aba" no canto superior direito do painel e conecte por lá!'
      );
    }
    throw error;
  }
}

/**
 * Sign out from Google Auth
 */
export async function logoutGoogle(): Promise<void> {
  await signOut(auth);
  cachedAccessToken = null;
}

/**
 * Searches for a folder by name. If it doesn't exist, creates it.
 */
export async function getOrCreateFolder(accessToken: string, folderName: string): Promise<string> {
  // 1. Search for existing folder
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  
  const searchRes = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`Erro ao buscar pasta: ${errText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // 2. Create the folder since it doesn't exist
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Erro ao criar pasta: ${errText}`);
  }

  const createData = await createRes.json();
  return createData.id;
}

/**
 * Creates and uploads a JSON backup file inside a specific folder in Google Drive
 */
export async function uploadBackupFile(
  accessToken: string,
  folderId: string,
  fileName: string,
  content: string
): Promise<string> {
  // 1. Create file metadata in Google Drive specifying the parent folder
  const metadataUrl = 'https://www.googleapis.com/drive/v3/files';
  const metadataRes = await fetch(metadataUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
    }),
  });

  if (!metadataRes.ok) {
    const errText = await metadataRes.text();
    throw new Error(`Erro ao criar metadados do arquivo: ${errText}`);
  }

  const fileMetadata = await metadataRes.json();
  const fileId = fileMetadata.id;

  // 2. Upload file content via the media endpoint
  const mediaUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const uploadRes = await fetch(mediaUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: content,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Erro ao enviar conteúdo do arquivo: ${errText}`);
  }

  return fileId;
}
