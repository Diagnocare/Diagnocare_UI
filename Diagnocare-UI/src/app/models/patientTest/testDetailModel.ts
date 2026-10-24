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

    /**
     * The technique the laboratory uses for this test — "GOD-POD", "Chemiluminescence".
     *
     * Comes from PathologyTest.method, which is null for every test recorded before the
     * field existed and for any whose method nobody has entered. Undefined and empty both
     * mean "not recorded", and the screens say so in words rather than hiding the row.
     */
    method?: string;

    /**
     * The technique the test is performed by, resolved server-side: the catalogue technique's
     * name where one is linked, otherwise the free-text `method`.
     *
     * Prefer this over `method` at every display site. Reading `method` directly shows
     * nothing for a test that carries a catalogue technique and no free text, which reads as
     * "no technique recorded" when the opposite is true.
     */
    effectiveMethod?: string;

    /** The catalogue technique's id, where the test is linked to one. */
    techniqueId?: number | null;
    status?: string;
    remarks?: string;
    isAbnormal?: boolean;
}

export interface testDetailResponse {
    tests: testDetail[];
}
