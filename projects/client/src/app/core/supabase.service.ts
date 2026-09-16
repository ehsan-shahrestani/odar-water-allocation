import { Injectable, InjectionToken, inject } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface SupabaseAuthStorageOptions {
  readonly storage: 'local' | 'session';
  readonly storageKey: string;
}

export const SUPABASE_AUTH_STORAGE_OPTIONS = new InjectionToken<SupabaseAuthStorageOptions>(
  'SUPABASE_AUTH_STORAGE_OPTIONS',
  {
    providedIn: 'root',
    factory: () => ({
      storage: 'local',
      storageKey: 'odar-client-auth-v1',
    }),
  },
);

function getBrowserStorage(type: SupabaseAuthStorageOptions['storage']): Storage | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    return type === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return undefined;
  }
}

function clearLegacyAuthStorage(currentStorageKey: string): void {
  if (typeof window === 'undefined') return;

  try {
    const projectRef = new URL(environment.supabaseUrl).hostname.split('.')[0];
    const legacyStorageKey = `sb-${projectRef}-auth-token`;
    if (legacyStorageKey === currentStorageKey) return;
    window.localStorage.removeItem(legacyStorageKey);
    window.sessionStorage.removeItem(legacyStorageKey);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly authStorageOptions = inject(SUPABASE_AUTH_STORAGE_OPTIONS);
  private readonly authStorage = getBrowserStorage(this.authStorageOptions.storage);

  readonly client = this.createClient();

  private createClient() {
    clearLegacyAuthStorage(this.authStorageOptions.storageKey);
    return createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
      auth: {
        storage: this.authStorage,
        storageKey: this.authStorageOptions.storageKey,
        persistSession: this.authStorage !== undefined,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }
}
