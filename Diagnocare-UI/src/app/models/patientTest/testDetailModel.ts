export interface testDetail {
    testRegId: number;
    pathologyId: string;
    testCode: string;
    testName: string;
    price: number;
    testParameter?: string;
    resultValue?: string;
    normalRange?: string;
    unit?: string;
    method?: string;
    status?: string;
    remarks?: string;
    isAbnormal?: boolean;
}

export interface testDetailResponse {
    tests: testDetail[];
}
