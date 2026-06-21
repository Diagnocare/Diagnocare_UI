import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ContactAddressService } from 'src/app/services/contactAddressServices/contact-address.service';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-contact-delete',
  templateUrl: './contact-delete.component.html',
  styleUrls: ['./contact-delete.component.css'],
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent]
})
export class ContactDeleteComponent {
  contactId: number | null = null;
  isLoading = false;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private contactService = inject(ContactAddressService);

  constructor() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.contactId = +id;
      }
    });
  }

  confirmDelete() {
    if (this.contactId == null) return;
    this.isLoading = true;
    this.contactService.deleteContact(this.contactId).subscribe(() => {
      this.isLoading = false;
      this.router.navigate(['/contacts']);
    });
  }

  cancel() {
    this.router.navigate(['/contacts']);
  }
}
