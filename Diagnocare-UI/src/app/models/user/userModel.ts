export interface userModel{
    user_Id: number;
    first_Name: string;
    last_Name: string;
    user_Name: string;
    password: string;
    email: string;
    contactPhone: number;
    emergencyContact?: number;
    profilePhoto?: string;
    loginType: number;
    typeUserId: number;
}