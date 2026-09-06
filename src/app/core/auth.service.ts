import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session, Subscription, User } from '@supabase/supabase-js';
import { UserProfile } from './auth.model';
import { SupabaseService } from './supabase.service';

export class AdminAuthError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = 'AdminAuthError';
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currentUserState = signal<User | null>(null);
  private readonly currentProfileState = signal<UserProfile | null>(null);
  private readonly loadingState = signal(true);
  private initializationPromise: Promise<void> | null = null;
  private authSubscription: Subscription | null = null;
  private activeProfileLoad: { userId: string; request: Promise<UserProfile> } | null = null;

  readonly currentUser = this.currentUserState.asReadonly();
  readonly currentProfile = this.currentProfileState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly isAuthenticated = computed(() => {
    const user = this.currentUserState();
    const profile = this.currentProfileState();
    return (
      user !== null && profile?.id === user.id && profile.role === 'admin' && profile.is_active
    );
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.authSubscription?.unsubscribe());
  }

  initializeSession(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;

    this.loadingState.set(true);
    this.registerAuthListener();
    this.initializationPromise = this.restoreSession().finally(() => this.loadingState.set(false));
    return this.initializationPromise;
  }

  async loginAdmin(email: string, password: string): Promise<void> {
    if (this.loadingState()) return;

    this.loadingState.set(true);
    this.currentProfileState.set(null);

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        throw new AdminAuthError('ایمیل یا رمز عبور صحیح نیست.');
      }

      this.currentUserState.set(data.user);
      try {
        await this.loadCurrentProfile();
      } catch (profileError: unknown) {
        await this.signOutAndClear();
        throw profileError;
      }
    } finally {
      this.loadingState.set(false);
    }
  }

  loadCurrentProfile(): Promise<UserProfile> {
    const user = this.currentUserState();
    if (!user) {
      return Promise.reject(new AdminAuthError('نشست شما معتبر نیست. دوباره وارد شوید.'));
    }

    const currentProfile = this.currentProfileState();
    if (currentProfile?.id === user.id) return Promise.resolve(currentProfile);
    if (this.activeProfileLoad?.userId === user.id) return this.activeProfileLoad.request;

    const request = this.fetchAndValidateProfile(user.id).finally(() => {
      if (this.activeProfileLoad?.userId === user.id) this.activeProfileLoad = null;
    });
    this.activeProfileLoad = { userId: user.id, request };
    return request;
  }

  async logout(): Promise<void> {
    if (this.loadingState()) return;

    this.loadingState.set(true);
    try {
      await this.supabase.auth.signOut();
    } finally {
      this.clearAuthState();
      this.loadingState.set(false);
      await this.router.navigateByUrl('/login');
    }
  }

  private registerAuthListener(): void {
    if (this.authSubscription) return;

    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (!session?.user) {
        this.clearAuthState();
        return;
      }

      this.currentUserState.set(session.user);
      this.currentProfileState.set(null);
      setTimeout(() => void this.handleAuthenticatedSession(session));
    });
    this.authSubscription = data.subscription;
  }

  private async restoreSession(): Promise<void> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error || !data.session?.user) {
      this.clearAuthState();
      return;
    }

    this.currentUserState.set(data.session.user);
    try {
      await this.loadCurrentProfile();
    } catch {
      await this.signOutAndClear();
    }
  }

  private async handleAuthenticatedSession(session: Session): Promise<void> {
    this.loadingState.set(true);
    try {
      this.currentUserState.set(session.user);
      await this.loadCurrentProfile();
    } catch {
      await this.signOutAndClear();
    } finally {
      this.loadingState.set(false);
    }
  }

  private async fetchAndValidateProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, phone, role, is_active')
      .eq('id', userId)
      .maybeSingle<UserProfile>();

    if (error) {
      throw new AdminAuthError('دریافت اطلاعات حساب ممکن نشد. دوباره تلاش کنید.');
    }
    if (!data) {
      throw new AdminAuthError('پروفایل کاربری شما پیدا نشد.');
    }
    if (!data.is_active) {
      throw new AdminAuthError('حساب کاربری شما غیرفعال است.');
    }
    if (data.role !== 'admin') {
      throw new AdminAuthError('این حساب اجازه ورود به پنل مدیریت را ندارد.');
    }

    this.currentProfileState.set(data);
    return data;
  }

  private async signOutAndClear(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
    } finally {
      this.clearAuthState();
    }
  }

  private clearAuthState(): void {
    this.currentUserState.set(null);
    this.currentProfileState.set(null);
    this.activeProfileLoad = null;
  }
}
