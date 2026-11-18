import assert from 'node:assert/strict';

// Mock minimal browser globals before importing favoriteShortcuts
const store = new Map<string, string>();
const dispatchedEvents: string[] = [];

(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); }
};

(globalThis as any).window = {
  localStorage: (globalThis as any).localStorage,
  dispatchEvent: (ev: any) => { dispatchedEvents.push(ev?.type || 'unknown'); },
  addEventListener: () => {},
  removeEventListener: () => {}
};

(globalThis as any).CustomEvent = class {
  type: string;
  detail: any;
  constructor(type: string, init?: { detail?: any }) {
    this.type = type;
    this.detail = init?.detail;
  }
};

import {
  MAX_FAVORITES,
  DEFAULT_FAVORITE_PATHS,
  ALL_SHORTCUT_REGISTRY,
  sanitizeFavoritePaths,
  syncFavoriteShortcutsForUser,
  getFavoritePaths,
  toggleFavoritePath,
  resetToDefaultFavorites,
  clearFavoriteShortcutsSession
} from '../src/lib/favoriteShortcuts';

console.log('=== Testes: Sincronização de Atalhos Favoritos ===');

// 1. Sanitização e preservação de lista vazia
assert.equal(sanitizeFavoritePaths(undefined), null);
assert.deepEqual(sanitizeFavoritePaths([]), []);
assert.deepEqual(
  sanitizeFavoritePaths(['/students', '/rota-inexistente', '/students', '/classes']),
  ['/students', '/classes']
);

const tooMany = Object.keys(ALL_SHORTCUT_REGISTRY).slice(0, MAX_FAVORITES + 5);
const sanitizedTooMany = sanitizeFavoritePaths(tooMany)!;
assert.equal(sanitizedTooMany.length, MAX_FAVORITES);
console.log('✓ 1. Sanitização, deduplicação e limite máximo validados');

// 2. Migração automática dos 14 atalhos salvos no localStorage legado (Preview) quando nuvem ainda está vazia
store.clear();
clearFavoriteShortcutsSession();
const preview14 = [
  ...DEFAULT_FAVORITE_PATHS,
  '/parishes?view=management',
  '/backup',
  '/impressos?type=ficha',
  '/impressos?type=declaracao',
  '/impressos?type=carteirinhas',
  '/impressos?type=etiquetas'
];
assert.equal(preview14.length, 14);
store.set('escmin_favorite_shortcuts', JSON.stringify(preview14));

const migrated = syncFavoriteShortcutsForUser({
  profileId: 'user-mauricio',
  authUserId: 'auth-mauricio',
  email: 'vmcjobnow@gmail.com',
  isSwitched: false,
  profileFavorites: undefined,
  metadataFavorites: undefined
});
assert.equal(migrated.length, 14);
assert.deepEqual(getFavoritePaths(), preview14);
assert.equal(store.get('escmin_favorite_shortcuts_user_user-mauricio'), JSON.stringify(preview14));
console.log('✓ 2. Migração automática dos 14 atalhos do Preview para o perfil do usuário validada');

// 3. Novo domínio / navegador limpo (ex: escmin.vercel.app) recebendo os 14 atalhos via nuvem (user_metadata)
store.clear();
clearFavoriteShortcutsSession();
const fromVercelCloud = syncFavoriteShortcutsForUser({
  profileId: 'user-mauricio',
  authUserId: 'auth-mauricio',
  email: 'vmcjobnow@gmail.com',
  isSwitched: false,
  profileFavorites: undefined,
  metadataFavorites: preview14
});
assert.equal(fromVercelCloud.length, 14);
assert.deepEqual(getFavoritePaths(), preview14);
console.log('✓ 3. Domínio publicado sem cache local recebe os 14 atalhos sincronizados da nuvem');

// 4. Toggle adicionar/remover, lista vazia e restaurar padrão
const removedOne = toggleFavoritePath('/backup');
assert.equal(removedOne.success, true);
assert.equal(removedOne.isFavorite, false);
assert.equal(removedOne.favorites.length, 13);

const resetRes = resetToDefaultFavorites();
assert.deepEqual(resetRes, DEFAULT_FAVORITE_PATHS);
assert.equal(getFavoritePaths().length, 8);
console.log('✓ 4. Toggle e restauração de padrão validados');

// 5. Isolamento entre usuários distintos no mesmo navegador
clearFavoriteShortcutsSession();
const user2 = syncFavoriteShortcutsForUser({
  profileId: 'user-outro',
  authUserId: 'auth-outro',
  email: 'outro@diocese.org',
  isSwitched: false,
  profileFavorites: ['/students', '/attendance'],
  metadataFavorites: undefined
});
assert.deepEqual(user2, ['/students', '/attendance']);
assert.deepEqual(getFavoritePaths(), ['/students', '/attendance']);
console.log('✓ 5. Isolamento entre contas distintas no mesmo navegador validado');

console.log('=== Todos os testes de atalhos favoritos passaram! ===');
