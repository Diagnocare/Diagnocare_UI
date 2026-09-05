import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter, withRouterConfig } from '@angular/router';
import { TitleStrategy } from '@angular/router';
import { Injectable } from '@angular/core';
import { RouterStateSnapshot } from '@angular/router';
import { Title } from '@angular/platform-browser';

@Injectable({ providedIn: 'root' })
class DiagnocarePageTitleStrategy extends TitleStrategy {
  constructor(private readonly title: Title) { super(); }
  override updateTitle(snapshot: RouterStateSnapshot): void {
    const t = this.buildTitle(snapshot);
    this.title.setTitle(t ? `DiagnoCare - ${t}` : 'DiagnoCare');
  }
}
import { routes } from './app/app-routing.module';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { AuthInterceptor } from './app/core/interceptors/auth.interceptor';
import { ErrorInterceptor } from './app/core/interceptors/error.interceptor';
import { installAutofillGuard } from './app/shared/autofill-guard';
import { provideAppInitializer, inject as injectFn } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TenantConfigService } from './app/core/tenant/tenant-config.service';

// Stop Chrome pushing the saved login user id into every text box.
// Must run before the first render so fields are stamped as they appear.
installAutofillGuard();

bootstrapApplication(AppComponent, {
  providers: [
    // ErrorInterceptor is listed first so it is the OUTERMOST on the response path:
    // AuthInterceptor (inner) handles 401 refresh/retry first, and only unresolved
    // errors bubble out to ErrorInterceptor for a centralised toast.
    provideHttpClient(withInterceptors([ErrorInterceptor, AuthInterceptor])),

    // Load the laboratory's branding before the first render (§9), so the login screen does
    // not flash generic Diagnocare branding and then repaint with the lab's name and logo.
    //
    // Deliberately non-fatal: TenantConfigService swallows the error and the app boots with
    // neutral branding. A branding endpoint being down is not a reason nobody can work.
    provideAppInitializer(() => firstValueFrom(injectFn(TenantConfigService).load())),
    provideRouter(
      routes,
      withRouterConfig({ onSameUrlNavigation: 'reload' })
    ),
    { provide: TitleStrategy, useClass: DiagnocarePageTitleStrategy },
    importProvidersFrom(
      BrowserAnimationsModule,
      ToastrModule.forRoot({
        positionClass: 'toast-top-right',
        timeOut: 5000,
        closeButton: true,
        progressBar: true,
        preventDuplicates: true
      })
    )
  ]
});