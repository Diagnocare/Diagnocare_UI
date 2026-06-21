import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-edit-test',
  templateUrl: './edit-test.component.html',
  styleUrls: ['./edit-test.component.scss'],
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent]
})
export class EditTestComponent implements OnInit {
  isLoading: boolean = false;
  testId: string = '';

  constructor(private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.testId = this.route.snapshot.paramMap.get('id') || '';
  }

  clickBack(): void {
    this.router.navigate(['/patients']);
  }
}
