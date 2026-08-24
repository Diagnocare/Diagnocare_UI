export class TestItem {
    testRegId: number = 0;
    subGroupId: string = '';
    PathologyId: string = '';
    GroupId: string = '';
    Id: number = 0;
    testCode: string = '';
    testName: string = '';
    price: number = 0;
    templateId: number | null = null;
    /**
     * Number of parameters configured for this test, supplied by GetTestList.
     * 0 means the test cannot be booked — there would be nothing to enter
     * results into. Defaults to 0 so a response without the field fails safe.
     */
    parameterCount: number = 0;

    constructor(init?: Partial<TestItem>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}
