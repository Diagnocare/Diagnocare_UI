import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { LicenceService } from 'src/app/services/licenceServices/licence.service';
import { TokenService }   from 'src/app/core/interceptors/token.service';
import { LoginService }   from 'src/app/services/loginServices/login.service';

@Component({
  selector: 'app-licence-expired',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './licence-expired.component.html',
  styleUrls: ['./licence-expired.component.scss']
})
export class LicenceExpiredComponent implements OnInit {

  expiryDate: Date | null = null;
  formattedExpiry = '';

  constructor(
    private licenceSvc:   LicenceService,
    private tokenService: TokenService,
    private loginService: LoginService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.licenceSvc.load().subscribe(() => {
      this.expiryDate    = this.licenceSvc.expiryDate;
      if (this.expiryDate) {
        const d = this.expiryDate;
        this.formattedExpiry = `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
      } else {
        this.formattedExpiry = '';
      }
    });
  }

  goToPathology(): void {
    this.router.navigate(['/pathology']);
  }

  logout(): void {
    this.loginService.logout().subscribe(() => {
      window.location.href = '/';
    });
  }
}
