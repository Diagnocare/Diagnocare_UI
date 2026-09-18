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

    /**
     * The technique the laboratory uses to perform this test — "GOD-POD",
     * "Chemiluminescence (CLIA)", "Automated cell counter, impedance".
     *
     * Null for every test recorded before the field existed, and for any test whose method
     * nobody has entered. Read sites must say "not recorded" rather than leave a blank that
     * reads as "no particular method", and nothing anywhere infers a default: a guessed
     * technique shown beside a result is worse than an absent one.
     */
    method: string | null = null;

    /**
     * The catalogue technique this test is performed by, when it is one of them.
     *
     * Preferred over `method`: a picked technique is spelt the same on every test, so the
     * lab can ask which of its tests are run by PCR. Null means either "not recorded" or
     * "a technique the catalogue does not carry" — the latter lives in `method`.
     */
    techniqueId: number | null = null;

    /**
     * What to show as this test's technique: the catalogue name where one is linked,
     * otherwise the free-text method. Computed by the API (PathologyTest.EffectiveMethod)
     * so every screen resolves the two fields identically rather than each inventing its
     * own precedence.
     */
    effectiveMethod: string | null = null;

    constructor(init?: Partial<TestItem>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}
