import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subject, takeUntil, filter } from 'rxjs';
import { summaryReportMenu } from 'src/app/constant/constants';


@Component({
  selector: 'app-summary-report-container',
  templateUrl: './summary-report-container.component.html',
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class SummaryReportContainerComponent implements OnInit, OnDestroy {
  activeReportLabel = 'Summary Report';
  activeReportIcon  = 'fa-chart-bar';

  /** Reverse lookup: kebab route segment → menu item (built once from summaryReportMenu). */
  private readonly pathToMenu: Record<string, { label: string; icon: string }> =
    Object.values(summaryReportMenu).reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {} as Record<string, { label: string; icon: string }>);

  private destroy$ = new Subject<void>();

  constructor(private router: Router, private location: Location) {}

  ngOnInit(): void {
    // Set header label from the active child route path — no query param needed.
    const updateFromUrl = (url: string) => {
      const tree     = this.router.parseUrl(url);
      const segments = tree.root.children['primary']?.segments ?? [];
      // For /reports/register-reports the last segment is 'register-reports'
      const childSeg = segments.length > 1 ? segments[segments.length - 1].path : '';
      const menuItem = this.pathToMenu[childSeg];
      this.activeReportLabel = menuItem?.label ?? 'Summary Report';
      this.activeReportIcon  = menuItem?.icon  ?? 'fa-chart-bar';
    };

    // Apply immediately for the current URL
    updateFromUrl(this.router.url);

    // Re-apply on every navigation
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(e => updateFromUrl((e as NavigationEnd).urlAfterRedirects));
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
