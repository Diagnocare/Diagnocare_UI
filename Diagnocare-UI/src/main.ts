import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
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
import { preconnectToApiOrigin } from './app/shared/api-preconnect';

// Start the DNS + TCP + TLS handshake to the API origin now, so it runs while
// Angular bootstraps instead of in front of the first XHR. Costs ~1.8 s when it
// is paid serially (PERF-009); no-op once the API is same-origin.
preconnectToApiOrigin();

// Stop Chrome pushing the saved login user id into every text box.
// Must run before the first render so fields are stamped as they appear.
installAutofillGuard();

bootstrapApplication(AppComponent, {
  providers: [
    // ErrorInterceptor is listed first so it is the OUTERMOST on the response path:
    // AuthInterceptor (inner) handles 401 refresh/retry first, and only unresolved
    // errors bubble out to ErrorInterceptor for a centralised toast.
    provideHttpClient(withInterceptors([ErrorInterceptor, AuthInterceptor])),
    // PERF-022: no `withRouterConfig({ onSameUrlNavigation: 'reload' })`.
    // It made the router re-run authGuard, licenceGuard and pinExpiryGuard when
    // navigating to the URL already shown — work that changes nothing, since the
    // default RouteReuseStrategy keeps the component instance and does not re-run
    // ngOnInit either way. It is also the likeliest cause of the licence expiry
    // endpoint being called twice per post-login load (PERF-025). A screen that
    // must re-read data on a repeat click should subscribe to `route.params` or
    // `router.events` itself.
    provideRouter(routes),
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