export class GroupSubGroupModel {
    testGroupId: string = '';
    groupSubgroupCode: string = '';
    name: string = '';
    price: number = 0;
    parentGroupId: string = '';
    templateId: number | null = null;
    groupRegId: number = 0;

    constructor(init?: Partial<GroupSubGroupModel>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}
