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


bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptors([AuthInterceptor])),
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