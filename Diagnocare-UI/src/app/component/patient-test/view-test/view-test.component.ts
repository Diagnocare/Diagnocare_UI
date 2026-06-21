import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-view-test',
  templateUrl: './view-test.component.html',
  styleUrls: ['./view-test.component.scss'],
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent]
})
export class ViewTestComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  isLoading: boolean = false;
  patientId: string = '';

  constructor(private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.initializeComponent();
  }

  initializeComponent(): void {
    this.patientId = this.route.snapshot.paramMap.get('id') || '';
  }

  clickBack(): void {
    this.router.navigate(['/patients']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
