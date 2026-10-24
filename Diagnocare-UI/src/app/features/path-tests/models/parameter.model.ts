export interface TestItemParameter {
    testRegId: number;
    testCode: string;
    parameterId: number;
    parameterName: string;
    parameterRangeLow: string;
    parameterRangeHigh: string;
    parameterUnit: string;
    parameterRange: string;
    /**
     * CRUD operation flag consumed by the TestParameterManipulation endpoint.
     * Set by the frontend before sending — never shown in the UI.
     * Values: 'Add' | 'Modified' | 'Delete'
     */
    type?: string;
}
