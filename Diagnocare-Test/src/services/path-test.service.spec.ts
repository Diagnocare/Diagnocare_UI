import { TestBed }                              from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { PathTestService }  from 'src/app/services/pathTestServices/path-test-service';
import { CommonService }    from 'src/app/shared/common.service';
import {
  MOCK_GROUP_RAW, MOCK_SUBGROUP_RAW, MOCK_TEST_LIST,
} from '../mocks/mock-data';

const BASE = 'http://localhost:5000/api/pathologyTest/';

function mockCommonService() {
  return { getPathologyId: jest.fn().mockReturnValue('1') };
}

describe('PathTestService', () => {
  let service:   PathTestService;
  let httpMock:  HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports:   [HttpClientTestingModule],
      providers: [
        PathTestService,
        { provide: CommonService, useValue: mockCommonService() },
      ],
    });

    service  = TestBed.inject(PathTestService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── getAllGroupList ──────────────────────────────────────────────────────────

  describe('getAllGroupList()', () => {
    it('sends GET to GetAllGroupList', () => {
      service.getAllGroupList().subscribe();

      const req = httpMock.expectOne(`${BASE}GetAllGroupList`);
      expect(req.request.method).toBe('GET');
      req.flush([MOCK_GROUP_RAW]);
    });

    it('normalises groupSubgroupCode → testGroupId', (done) => {
      service.getAllGroupList().subscribe(groups => {
        expect(groups[0].testGroupId).toBe('G001');
        done();
      });
      httpMock.expectOne(`${BASE}GetAllGroupList`).flush([MOCK_GROUP_RAW]);
    });

    it('normalises groupSubGroupName → name', (done) => {
      service.getAllGroupList().subscribe(groups => {
        expect(groups[0].name).toBe('Haematology');
        done();
      });
      httpMock.expectOne(`${BASE}GetAllGroupList`).flush([MOCK_GROUP_RAW]);
    });

    it('falls back to groupRegId when groupSubgroupCode is absent', (done) => {
      const raw = { groupRegId: 'REG01', groupSubGroupName: 'Biochemistry' };

      service.getAllGroupList().subscribe(groups => {
        expect(groups[0].testGroupId).toBe('REG01');
        done();
      });
      httpMock.expectOne(`${BASE}GetAllGroupList`).flush([raw]);
    });

    it('falls back to name field when groupSubGroupName is absent', (done) => {
      const raw = { groupSubgroupCode: 'G002', name: 'Microbiology' };

      service.getAllGroupList().subscribe(groups => {
        expect(groups[0].name).toBe('Microbiology');
        done();
      });
      httpMock.expectOne(`${BASE}GetAllGroupList`).flush([raw]);
    });

    it('defaults to empty string when all name fields are absent', (done) => {
      const raw = { groupSubgroupCode: 'G003' };

      service.getAllGroupList().subscribe(groups => {
        expect(groups[0].name).toBe('');
        done();
      });
      httpMock.expectOne(`${BASE}GetAllGroupList`).flush([raw]);
    });

    it('returns an empty array when API returns null', (done) => {
      service.getAllGroupList().subscribe(groups => {
        expect(groups).toEqual([]);
        done();
      });
      httpMock.expectOne(`${BASE}GetAllGroupList`).flush(null);
    });

    it('propagates errors', (done) => {
      service.getAllGroupList().subscribe({
        error: err => { expect(err).toBeTruthy(); done(); },
      });
      httpMock
        .expectOne(`${BASE}GetAllGroupList`)
        .flush(null, { status: 500, statusText: 'Server Error' });
    });
  });

  // ── getAllSubGroupList ───────────────────────────────────────────────────────

  describe('getAllSubGroupList()', () => {
    it('sends GET to GetAllSubGroupList with testGroupId', () => {
      service.getAllSubGroupList('G001').subscribe();

      const req = httpMock.expectOne(`${BASE}GetAllSubGroupList?testGroupId=G001`);
      expect(req.request.method).toBe('GET');
      req.flush([MOCK_SUBGROUP_RAW]);
    });

    it('passes empty string when groupId is null', () => {
      service.getAllSubGroupList(null).subscribe();

      const req = httpMock.expectOne(`${BASE}GetAllSubGroupList?testGroupId=`);
      req.flush([]);
    });

    it('normalises subgroup fields correctly', (done) => {
      service.getAllSubGroupList('G001').subscribe(subs => {
        expect(subs[0].testGroupId).toBe('SG001');
        expect(subs[0].name).toBe('CBC');
        expect(subs[0].price).toBe(150);
        expect(subs[0].parentGroupId).toBe('G001');
        done();
      });
      httpMock
        .expectOne(`${BASE}GetAllSubGroupList?testGroupId=G001`)
        .flush([MOCK_SUBGROUP_RAW]);
    });
  });

  // ── getAllTestList ───────────────────────────────────────────────────────────

  describe('getAllTestList()', () => {
    it('sends GET to GetTestList with subGroupId', () => {
      service.getAllTestList('SG001').subscribe();

      const req = httpMock.expectOne(`${BASE}GetTestList?subGroupId=SG001`);
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_TEST_LIST);
    });

    it('returns raw test list (no normalisation applied)', (done) => {
      service.getAllTestList('SG001').subscribe(tests => {
        expect(tests.length).toBe(2);
        expect(tests[0].testName).toBe('Haemoglobin');
        done();
      });
      httpMock.expectOne(`${BASE}GetTestList?subGroupId=SG001`).flush(MOCK_TEST_LIST);
    });

    it('passes empty string when subGroupId is null', () => {
      service.getAllTestList(null).subscribe();

      const req = httpMock.expectOne(`${BASE}GetTestList?subGroupId=`);
      req.flush([]);
    });
  });

  // ── dropTest ────────────────────────────────────────────────────────────────

  describe('dropTest()', () => {
    it('sends DELETE to Delete endpoint with body', () => {
      const dto = { type: 'test', id: 'T001' } as any;
      service.dropTest(dto).subscribe();

      const req = httpMock.expectOne(`${BASE}Delete`);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.body).toEqual(dto);
      req.flush({ success: true });
    });

    it('propagates error when delete fails', (done) => {
      service.dropTest({ type: 'group', id: 'G999' } as any).subscribe({
        error: err => { expect(err).toBeTruthy(); done(); },
      });

      httpMock
        .expectOne(`${BASE}Delete`)
        .flush(null, { status: 404, statusText: 'Not Found' });
    });
  });

  // ── convenience public methods ───────────────────────────────────────────────

  describe('getTestGroupList()', () => {
    it('delegates to getAllGroupList', () => {
      service.getTestGroupList().subscribe();
      httpMock.expectOne(`${BASE}GetAllGroupList`).flush([]);
    });
  });

  describe('getTestSubGroupList()', () => {
    it('delegates to getAllSubGroupList with the supplied id', () => {
      service.getTestSubGroupList('G001').subscribe();
      httpMock.expectOne(`${BASE}GetAllSubGroupList?testGroupId=G001`).flush([]);
    });
  });

  describe('getMedicalTestList()', () => {
    it('delegates to getAllTestList with the supplied id', () => {
      service.getMedicalTestList('SG001').subscribe();
      httpMock.expectOne(`${BASE}GetTestList?subGroupId=SG001`).flush([]);
    });
  });
});
