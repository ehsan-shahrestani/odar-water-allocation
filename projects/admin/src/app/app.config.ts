import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { SUPABASE_AUTH_STORAGE_OPTIONS } from '@core/supabase.service';
import { routes } from './app.routes';
import { AdminAuthService } from './core/admin-auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAppInitializer(() => inject(AdminAuthService).initializeSession()),
    {
      provide: SUPABASE_AUTH_STORAGE_OPTIONS,
      useValue: {
        storage: 'session',
        storageKey: 'odar-admin-auth-v1',
      },
    },
  ],
};
