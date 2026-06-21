/** Response returned by the server after successful pathology registration */
export interface PathologyRegisterResponseDto {
  success: boolean;
  message?: string;
  licenseKey?: string;
  path_Id?: string;
}
