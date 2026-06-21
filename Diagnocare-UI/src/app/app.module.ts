import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule} from '@angular/forms';
import { LoginService } from 'src/app/services/loginServices/login.service';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
// import jwtDecode { JwtPayload } from 'jwt-decode';


@NgModule({
  declarations: [
    // AppComponent,
    // LoginComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    BrowserAnimationsModule,
    CommonModule,
    ToastrModule.forRoot({
       positionClass: 'toast-top-right',
      timeOut: 5000,
      closeButton: true,
      progressBar: true,
      preventDuplicates: true
    })
  ],
  providers: [LoginService
  ],
  // bootstrap: [AppComponent]
})
export class AppModule { }