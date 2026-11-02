'use strict';

/**
 * Demo data for the tutorial recording.
 *
 * Invented names and plausible lab values only — nothing here comes from a real lab or a
 * real patient. Field names match what the UI's own mappers read (see
 * PatientsListComponent.mapPatient and PathTestService.normalizeGroup), so the mock
 * exercises the same parsing the real API does.
 */

function dmy(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/**
 * Deliberately NOT stored urgent-first: the two urgent patients sit at positions 3 and 6
 * in registration order, so the patient list's urgent-first ordering is visibly doing
 * something in the recording rather than agreeing with the order by accident.
 */
const patients = [
  ['DC-10431', 'Mr.',   'Ananya Desai',     '34Y 2M 11D', 'Female', 'Pending',   'No',  0,  'Kiran Desai',    'Husband'],
  ['DC-10430', 'Mr.',   'Rohit Malhotra',   '41Y 7M 2D',  'Male',   'Partial',   'No',  0,  'Suman Malhotra', 'Wife'],
  ['DC-10429', 'Mrs.',  'Sarah Johnson',    '29Y 0M 18D', 'Female', 'Pending',   'Yes', 1,  'Mark Johnson',   'Husband'],
  ['DC-10428', 'Mr.',   'David Brown',      '56Y 4M 6D',  'Male',   'Completed', 'No',  1,  'Helen Brown',    'Wife'],
  ['DC-10427', 'Miss.', 'Priya Nair',       '22Y 9M 30D', 'Female', 'Pending',   'No',  2,  'Anil Nair',      'Father'],
  ['DC-10426', 'Mr.',   'John Smith',       '63Y 1M 4D',  'Male',   'Partial',   'Yes', 2,  'Mary Smith',     'Wife'],
  ['DC-10425', 'Mr.',   'Michael Lee',      '38Y 11M 9D', 'Male',   'Completed', 'No',  3,  'Grace Lee',      'Wife'],
  ['DC-10424', 'Mrs.',  'Fatima Sheikh',    '47Y 3M 21D', 'Female', 'Pending',   'No',  3,  'Imran Sheikh',   'Husband'],
  ['DC-10423', 'Mr.',   'Arjun Verma',      '31Y 6M 15D', 'Male',   'Partial',   'No',  4,  'Neha Verma',     'Wife'],
  ['DC-10422', 'Miss.', 'Chen Wei',         '26Y 2M 3D',  'Female', 'Completed', 'No',  4,  'Li Wei',         'Father'],
  ['DC-10421', 'Mr.',   'Daniel Okafor',    '52Y 8M 27D', 'Male',   'Pending',   'No',  5,  'Ada Okafor',     'Wife'],
  ['DC-10420', 'Mrs.',  'Laila Haddad',     '44Y 5M 12D', 'Female', 'Completed', 'No',  5,  'Omar Haddad',    'Husband'],
].map(([id, sal, name, age, gender, status, urgent, daysAgo, relName, relation], i) => ({
  serialNumber: 12 - i,
  patientId: id,
  patientSalutation: sal,
  patientName: name,
  patientAge: age,
  patientAgeGroup: 'Adult',
  patientGender: gender,
  patientMaritalStatus: 'Married',
  patientAddress: '14 Lakeview Road, Pune 411004',
  relation,
  relativeName: relName,
  patientContact: `98${String(76543210 - i * 1111).padStart(8, '0')}`,
  patientEmail: `${name.split(' ')[0].toLowerCase()}@example.com`,
  patientRegDate: dmy(daysAgo),
  patientDOB: '',
  testStatus: status,
  isUrgent: urgent,
  isActive: true,
  lstPatientTests: { urgent_Report: urgent === 'Yes' },
}));

/** Group → SubGroup → Test, the catalogue hierarchy the whole app is built around. */
const groups = [
  { groupSubgroupCode: 'G001', groupSubGroupName: 'Haematology',       price: 0, parentGroupId: '0', groupRegId: 1 },
  { groupSubgroupCode: 'G002', groupSubGroupName: 'Biochemistry',      price: 0, parentGroupId: '0', groupRegId: 2 },
  { groupSubgroupCode: 'G003', groupSubGroupName: 'Clinical Pathology',price: 0, parentGroupId: '0', groupRegId: 3 },
  { groupSubgroupCode: 'G004', groupSubGroupName: 'Serology',          price: 0, parentGroupId: '0', groupRegId: 4 },
];

const subGroups = [
  { groupSubgroupCode: 'S001', groupSubGroupName: 'Complete Blood Count', price: 350,  parentGroupId: 'G001', groupRegId: 11 },
  { groupSubgroupCode: 'S002', groupSubGroupName: 'Coagulation Profile',   price: 600,  parentGroupId: 'G001', groupRegId: 12 },
  { groupSubgroupCode: 'S003', groupSubGroupName: 'Liver Function Test',   price: 850,  parentGroupId: 'G002', groupRegId: 13 },
  { groupSubgroupCode: 'S004', groupSubGroupName: 'Kidney Function Test',  price: 900,  parentGroupId: 'G002', groupRegId: 14 },
  { groupSubgroupCode: 'S005', groupSubGroupName: 'Lipid Profile',         price: 750,  parentGroupId: 'G002', groupRegId: 15 },
  { groupSubgroupCode: 'S006', groupSubGroupName: 'Urine Routine',         price: 250,  parentGroupId: 'G003', groupRegId: 16 },
  { groupSubgroupCode: 'S007', groupSubGroupName: 'Thyroid Profile',       price: 1100, parentGroupId: 'G004', groupRegId: 17 },
];

const tests = [
  { testCode: 'T0001', testName: 'Haemoglobin',              price: 120, subGroupId: 'S001', method: 'Photometric, SLS-haemoglobin' },
  { testCode: 'T0002', testName: 'Total Leucocyte Count',    price: 110, subGroupId: 'S001', method: 'Automated cell counter, impedance' },
  { testCode: 'T0003', testName: 'Platelet Count',           price: 130, subGroupId: 'S001', method: 'Automated cell counter, impedance' },
  { testCode: 'T0004', testName: 'Prothrombin Time',         price: 320, subGroupId: 'S002', method: 'Clot detection, mechanical' },
  { testCode: 'T0005', testName: 'Serum Bilirubin (Total)',  price: 210, subGroupId: 'S003', method: 'Diazo, Jendrassik-Grof' },
  { testCode: 'T0006', testName: 'SGPT / ALT',               price: 230, subGroupId: 'S003', method: 'IFCC without pyridoxal phosphate' },
  { testCode: 'T0007', testName: 'SGOT / AST',               price: 230, subGroupId: 'S003', method: 'IFCC without pyridoxal phosphate' },
  { testCode: 'T0008', testName: 'Serum Creatinine',         price: 190, subGroupId: 'S004', method: 'Jaffe, kinetic alkaline picrate' },
  { testCode: 'T0009', testName: 'Blood Urea',               price: 180, subGroupId: 'S004', method: 'Urease, GLDH' },
  { testCode: 'T0010', testName: 'Total Cholesterol',        price: 200, subGroupId: 'S005', method: 'CHOD-PAP' },
  { testCode: 'T0011', testName: 'Triglycerides',            price: 210, subGroupId: 'S005', method: 'GPO-PAP' },
  { testCode: 'T0012', testName: 'Urine Albumin',            price: 90,  subGroupId: 'S006', method: 'Dipstick, reflectance' },
  { testCode: 'T0013', testName: 'TSH',                      price: 420, subGroupId: 'S007', method: 'Chemiluminescence (CLIA)' },
  { testCode: 'T0014', testName: 'Free T4',                  price: 400, subGroupId: 'S007', method: 'Chemiluminescence (CLIA)' },
];

const techniques = [
  { techniqueId: 1, name: 'Chemiluminescence (CLIA)',               category: 'Immunoassay' },
  { techniqueId: 2, name: 'ELISA',                                  category: 'Immunoassay' },
  { techniqueId: 3, name: 'CHOD-PAP',                               category: 'Photometry' },
  { techniqueId: 4, name: 'Automated cell counter, impedance',      category: 'Haematology' },
  { techniqueId: 5, name: 'Real-time PCR',                          category: 'Molecular' },
];

module.exports = { patients, groups, subGroups, tests, techniques, dmy };
