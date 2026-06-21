import { TestBed } from '@angular/core/testing';

import { TestParameter } from './test-parameter';

describe('TestParameter', () => {
  let service: TestParameter;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TestParameter);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
