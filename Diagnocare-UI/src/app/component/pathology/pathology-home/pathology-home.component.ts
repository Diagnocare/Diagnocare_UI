import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { Role, RoleId } from 'src/app/constant/enums';

interface ActionCard {
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
}

interface CardGroup {
  label: string;
  icon: string;
  cards: ActionCard[];
}

@Component({
  selector: 'app-pathology-home',
  templateUrl: './pathology-home.component.html',
  styleUrls: ['./pathology-home.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class PathologyHomeComponent implements OnInit, OnDestroy {

  userRole: RoleId | null = null;
  userRoleDisplay = '';
  userName = '';

  greeting = '';
  todayDisplay = '';
  currentYear = new Date().getFullYear();

  showExpiryBanner = false;
  isLicenseExpired = false;
  expiryDate = '';
  daysUntilExpiry = 0;

  cardGroups: CardGroup[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private pathologyService: PathologyService,
    private router: Router,
    private tokenService: TokenService,
  ) {}

  ngOnInit(): void {
    this.loadUserInfo();
    this.buildGreeting();
    this.buildCards();
    this.checkPathologyExpiry();
  }

  private loadUserInfo(): void {
    this.userRole        = this.tokenService.getUserRole();
    this.userRoleDisplay = this.userRole !== null
      ? (Object.values(Role).find(r => r.id === this.userRole)?.label ?? '')
      : '';
    this.userName        = this.tokenService.getUserId() ?? 'User';
  }

  private buildGreeting(): void {
    const hour = new Date().getHours();
    if (hour < 12)      this.greeting = 'Good Morning';
    else if (hour < 17) this.greeting = 'Good Afternoon';
    else                this.greeting = 'Good Evening';

    const now = new Date();
    const weekday = now.toLocaleDateString('en-IN', { weekday: 'long' });
    const dd = now.getDate().toString().padStart(2, '0');
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    this.todayDisplay = `${weekday}, ${dd}-${mm}-${now.getFullYear()}`;
  }

  private buildCards(): void {
    const isAdmin      = this.tokenService.isAdmin();
    const isSuperAdmin = this.tokenService.isSuperAdmin();

    const patientCards: ActionCard[] = [
      {
        title: 'Patients',
        description: 'Register, search and manage patient records',
        icon: 'fa-users',
        route: '/patients',
        color: 'indigo'
      },
      {
        title: 'Patient Tests',
        description: 'View and manage test requests and results',
        icon: 'fa-flask',
        route: '/patient-tests',
        color: 'blue'
      },
    ];

    const labCards: ActionCard[] = [
      {
        title: 'Manage Tests',
        description: 'Configure lab tests, parameters and pricing',
        icon: 'fa-list-alt',
        route: '/manage-tests',
        color: 'teal'
      },
      {
        title: 'Reports',
        description: 'Generate and export diagnostic reports',
        icon: 'fa-bar-chart',
        route: '/reports',
        color: 'green'
      },
    ];

    const adminCards: ActionCard[] = [];
    if (isAdmin) {
      adminCards.push(
        {
          title: 'Users',
          description: 'Create and manage system user accounts',
          icon: 'fa-user-circle',
          route: '/users',
          color: 'violet'
        },
        {
          title: 'Doctors',
          description: 'Maintain the referring doctors directory',
          icon: 'fa-stethoscope',
          route: '/doctors',
          color: 'amber'
        },
        {
          title: 'Collection Boys',
          description: 'Manage sample collection staff',
          icon: 'fa-motorcycle',
          route: '/collection-boys',
          color: 'rose'
        },
        {
          title: 'Address Manager',
          description: 'Manage contact and address records',
          icon: 'fa-address-book',
          route: '/contacts',
          color: 'cyan'
        },
      );
    }

    const systemCards: ActionCard[] = [];
    if (isSuperAdmin) {
      systemCards.push(
        {
          title: 'Lab Profile',
          description: 'View and update lab information',
          icon: 'fa-building',
          route: '/lab-profile',
          color: 'indigo'
        },
        {
          title: 'Lab Setup',
          description: 'Configure lab settings and preferences',
          icon: 'fa-cogs',
          route: '/lab-setup',
          color: 'slate'
        },
        {
          title: 'Report Templates',
          description: 'Design and manage report templates',
          icon: 'fa-file-text',
          route: '/template',
          color: 'violet'
        },
      );
    }

    const accountCards: ActionCard[] = [
      {
        title: 'Attendance',
        description: 'Track and manage staff attendance',
        icon: 'fa-calendar-check-o',
        route: '/attendance',
        color: 'teal'
      },
      {
        title: 'Settings',
        description: 'Manage your account preferences',
        icon: 'fa-sliders',
        route: '/settings',
        color: 'slate'
      },
    ];

    this.cardGroups = [
      { label: 'Patient Management', icon: 'fa-user-md',     cards: patientCards },
      { label: 'Laboratory',         icon: 'fa-flask',        cards: labCards     },
      { label: 'Administration',     icon: 'fa-users',        cards: adminCards   },
      { label: 'System',             icon: 'fa-cog',          cards: systemCards  },
      { label: 'Account',            icon: 'fa-id-badge',     cards: accountCards },
    ].filter(g => g.cards.length > 0);
  }

  navigate(route: string): void {
    this.router.navigate([route]);
  }

  private checkPathologyExpiry(): void {
    this.pathologyService.getPathologyExpiryDate()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.pathologyExpiryDate) {
            const expiryDate = new Date(response.pathologyExpiryDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            expiryDate.setHours(0, 0, 0, 0);
            this.daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const ed = expiryDate;
            this.expiryDate = `${ed.getDate().toString().padStart(2,'0')}-${(ed.getMonth()+1).toString().padStart(2,'0')}-${ed.getFullYear()}`;

            if (this.daysUntilExpiry <= 0) {
              this.isLicenseExpired = true;
            } else if (this.daysUntilExpiry <= 15) {
              this.showExpiryBanner = true;
            }
          }
        },
        error: () => {}
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
