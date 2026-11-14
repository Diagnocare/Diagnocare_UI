'use strict';

/**
 * A deliberately small test catalogue: two departments, enough tests to make a booking with a
 * discount worth checking, and one test with NO parameters so the "cannot be booked yet" rule
 * has something to bite on.
 *
 * Reference ranges are the plain "low-high" form the verify screen's range reader understands.
 * Invented, plausible values only.
 */

const groups = [
  { groupSubgroupCode: 'G001', groupSubGroupName: 'Haematology',  price: 0, parentGroupId: '0', groupRegId: 1 },
  { groupSubgroupCode: 'G002', groupSubGroupName: 'Biochemistry', price: 0, parentGroupId: '0', groupRegId: 2 },
];

const subGroups = [
  { groupSubgroupCode: 'S001', groupSubGroupName: 'Complete Blood Count', price: 0, parentGroupId: 'G001', groupRegId: 11 },
  { groupSubgroupCode: 'S003', groupSubGroupName: 'Liver Function Test',   price: 0, parentGroupId: 'G002', groupRegId: 13 },
];

const tests = [
  { testRegId: 101, testCode: 'T0001', testName: 'Haemoglobin',            price: 120, subGroupId: 'S001', method: 'Photometric, SLS-haemoglobin' },
  { testRegId: 102, testCode: 'T0002', testName: 'Total Leucocyte Count',  price: 110, subGroupId: 'S001', method: 'Automated cell counter, impedance' },
  { testRegId: 105, testCode: 'T0005', testName: 'Serum Bilirubin (Total)', price: 210, subGroupId: 'S003', method: 'Diazo, Jendrassik-Grof' },
  // No parameters: nothing to enter results into, so the registration screen must refuse it.
  { testRegId: 199, testCode: 'T0099', testName: 'Experimental Assay',     price: 500, subGroupId: 'S003', method: null },
];

const PARAMETERS = {
  T0001: [{ parameterId: 1, parameterName: 'Haemoglobin', parameterUnit: 'g/dL', parameterRange: '13.0-17.0' }],
  T0002: [{ parameterId: 2, parameterName: 'Total Leucocyte Count', parameterUnit: 'cells/cumm', parameterRange: '4000-11000' }],
  T0005: [
    { parameterId: 5, parameterName: 'Bilirubin Total',  parameterUnit: 'mg/dL', parameterRange: '0.3-1.2' },
    { parameterId: 6, parameterName: 'Bilirubin Direct', parameterUnit: 'mg/dL', parameterRange: '0.0-0.3' },
  ],
  T0099: [],
};

const parametersFor = code => PARAMETERS[code] ?? [];

module.exports = { groups, subGroups, tests, parametersFor };
