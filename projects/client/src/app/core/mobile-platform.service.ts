import { Location } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { toast } from 'ngx-sonner';

@Injectable({
  providedIn: 'root',
})
export class MobilePlatformService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private lastBackPressTime = 0;

  initialize(): void {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    void this.setupStatusBar();
    void this.hideSplashScreen();
    this.setupBackButton();
  }

  private async setupStatusBar(): Promise<void> {
    try {
      await StatusBar.setBackgroundColor({ color: '#07482d' });
      await StatusBar.setStyle({ style: Style.Dark });
    } catch (err) {
      console.warn('StatusBar not available:', err);
    }
  }

  private async hideSplashScreen(): Promise<void> {
    try {
      await SplashScreen.hide();
    } catch (err) {
      console.warn('SplashScreen not available:', err);
    }
  }

  private setupBackButton(): void {
    void App.addListener('backButton', ({ canGoBack }) => {
      const currentUrl = this.router.url;
      const isRootPage =
        currentUrl === '/login' ||
        currentUrl === '/farmer' ||
        currentUrl === '/representative' ||
        currentUrl === '/';

      if (isRootPage || !canGoBack) {
        const now = Date.now();
        if (now - this.lastBackPressTime < 2000) {
          void App.exitApp();
        } else {
          this.lastBackPressTime = now;
          toast.info('برای خروج دوباره بازگشت را بزنید');
        }
      } else {
        this.location.back();
      }
    });
  }
}
