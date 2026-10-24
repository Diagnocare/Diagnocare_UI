/**
 * Represents a single report template returned by the backend.
 * The backend populates the document with real pathology, patient,
 * test, test-parameter and doctor data before serving the file.
 */
export interface TemplateListDTO {
  /** Unique identifier used for preview / download requests. */
  templateId: number;
  /** Human-readable display name shown on the card. */
  templateName: string;
  /** Short description of what the template covers. */
  description: string;
  /** File format the backend will serve ('pdf' | 'docx'). */
  format: 'pdf' | 'docx';
  /** Optional grouping label (e.g. "Standard", "Detailed", "Summary"). */
  category?: string;
  /**
   * Optional base-64 encoded PNG/JPEG thumbnail that the backend can
   * include so the card can display a small visual preview without an
   * extra network call.
   */
  thumbnailBase64?: string;
  /** ISO date string – when this template was last updated. */
  updatedAt?: string;
}
