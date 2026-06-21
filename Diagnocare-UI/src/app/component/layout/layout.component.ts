import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../header/header-menu/header.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterModule, CommonModule, HeaderComponent],
  templateUrl: './layout.component.html'
})
export class LayoutComponent implements OnInit {
  passwordExpiryDaysLeft: number | null = null;

  ngOnInit(): void {
    const stored = sessionStorage.getItem('passwordExpiryDaysLeft');
    if (stored !== null) {
      this.passwordExpiryDaysLeft = Number(stored);
    }
  }

  dismissExpiryWarning(): void {
    this.passwordExpiryDaysLeft = null;
    sessionStorage.removeItem('passwordExpiryDaysLeft');
  }
}
