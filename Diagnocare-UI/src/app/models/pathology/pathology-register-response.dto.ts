/** Response returned by the server after successful pathology registration */
export interface PathologyRegisterResponseDto {
  success: boolean;
  message?: string;
  /** Pathology identifier (labId) from the PathologyManager service, e.g. "Path1000". */
  pathId?: string;
}
