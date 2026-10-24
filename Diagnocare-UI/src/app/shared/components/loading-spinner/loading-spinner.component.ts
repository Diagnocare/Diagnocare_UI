import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-spinner',
  templateUrl: './loading-spinner.component.html',
  styleUrls: ['./loading-spinner.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class LoadingSpinnerComponent {
  @Input() isLoading: boolean = false;
  @Input() message: string = 'Loading...';
}
