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

    constructor(init?: Partial<TestItem>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}
