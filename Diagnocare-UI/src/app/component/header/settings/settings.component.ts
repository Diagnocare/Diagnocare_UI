import { Component, OnInit } from '@angular/core';
import { CommonService } from 'src/app/shared/common.service';
import { jwtDecode } from 'jwt-decode';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HeaderService } from 'src/app/services/headerServices/header-service';
import { AuthType } from 'src/app/constant/enums';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['../account-pages.shared.css', './settings.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class SettingsComponent implements OnInit {
  user: any;
  pathology_Id: string = '';
  userName: string = '';
  selectedAuthType: AuthType | null = null;
  authTypeOptions = Object.keys(AuthType)
    .filter(key => !isNaN(Number(AuthType[key as any])))
    .map(key => ({ value: AuthType[key as keyof typeof AuthType], label: key.replace(/([A-Z])/g, ' $1').trim() }));
  editingAuthType: boolean = false;

  AuthType = AuthType;
  errorMsg:   string = '';
  successMsg: string = '';

  constructor(
    private headerService: HeaderService,
    private common: CommonService,
  ) {
    const token = this.common.getAccessToken();
    if (token) {
      const decoded = jwtDecode<any>(token || '');
      this.pathology_Id = decoded.typ;
      this.userName = decoded.sub;
    }
  }

  ngOnInit(): void {
    this.headerService.getUserDetails(this.userName).subscribe((data: any) => {
      this.user = data;
      this.selectedAuthType = data.loginType;
    });
  }

  get currentAuthTypeLabel(): string {
    const found = this.authTypeOptions.find(opt => opt.value === this.selectedAuthType);
    return found ? found.label : 'Unknown';
  }

  saveAuthTypeChange(): void {
    this.errorMsg   = '';
    this.successMsg = '';
    const newType = this.selectedAuthType;
    if (newType === null) {
      this.errorMsg = 'Please select an authentication type.';
      return;
    }
    if (newType === AuthType.Mobile && !this.user.contactPhone) {
      this.errorMsg = 'No valid mobile number found in your profile. Update using Profile section first.';
      return;
    }
    if (newType === AuthType.Email && !this.user.email) {
      this.errorMsg = 'No valid email found in your profile. Update using Profile section first.';
      return;
    }
    this.headerService.updateAuthType(this.userName, Number(newType)).subscribe({
      next: () => {
        this.successMsg = 'Preferred authentication mode updated.';
        this.editingAuthType = false;
      },
      error: () => {
        this.errorMsg = 'Failed to update authentication mode.';
      }
    });
  }
}
