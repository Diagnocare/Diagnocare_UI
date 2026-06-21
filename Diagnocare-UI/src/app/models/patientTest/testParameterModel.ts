export interface testParameter {
    parameterId: number;
    testRegId: number;
    parameterName: string;
    parameterUnit: string;
    parameterRange: string;
    type?: string;
    resultValue?: string;
    /**
     * The primary-key `id` of the existing testReport row returned by
     * getSavedTestReport(). When present the row must be UPDATEd rather
     * than INSERTed. Absent (undefined) means the row does not yet exist
     * in the database and must be INSERTed.
     */
    reportId?: number;
}

export interface testParameterResponse {
    parameters: testParameter[];
}

export interface PatientTestReport {
    id?: number;
    pathologyId: string;
    testCode: string;
    testRegId: string;
    parameterId: number;
    obtainedValue: string;
}
