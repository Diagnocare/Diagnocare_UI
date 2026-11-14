import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';
import { ContactListComponent } from './contact-list.component';
import { ContactAddressService } from 'src/app/services/contactAddressServices/contact-address.service';

const makeContacts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Contact ${i + 1}`, city: 'X' })) as any[];

describe('ContactListComponent pagination', () => {
  function setup(count: number) {
    TestBed.configureTestingModule({
      imports: [ContactListComponent],
      providers: [
        { provide: ContactAddressService, useValue: { getContacts: () => of(makeContacts(count)) } },
        { provide: Router, useValue: { navigate: jasmine.createSpy() } },
        { provide: Location, useValue: { back: jasmine.createSpy() } },
      ],
    });
    const fixture = TestBed.createComponent(ContactListComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('defaults to 5 per page, matching the dropdown and the rendered rows', () => {
    const f = setup(23);
    const c = f.componentInstance;
    const select: HTMLSelectElement = f.nativeElement.querySelector('select[aria-label="Rows per page"]');
    expect(c.pageSize).toBe(5);
    expect(+select.value).toBe(5);
    expect(c.pagedContacts.length).toBe(5);
    expect(c.totalPages).toBe(5);
  });

  it('changing page size resets to page 1 and recalculates pages', () => {
    const c = setup(60).componentInstance;
    c.goToPage(3);
    c.changePageSize(25);
    expect(c.currentPage).toBe(1);
    expect(c.pagedContacts.length).toBe(25);
    expect(c.totalPages).toBe(3);
  });

  it('keeps page size across page navigation and search', () => {
    const c = setup(30).componentInstance;
    c.changePageSize(10);
    c.nextPage();
    expect(c.pageSize).toBe(10);
    expect(c.currentPage).toBe(2);
    c.onSearch('Contact 1');
    expect(c.pageSize).toBe(10);
    expect(c.pagedContacts.length).toBeLessThanOrEqual(10);
  });

  it('renders fewer rows than page size when fewer records exist', () => {
    const c = setup(3).componentInstance;
    expect(c.pagedContacts.length).toBe(3);
    expect(c.totalPages).toBe(1);
  });
});
