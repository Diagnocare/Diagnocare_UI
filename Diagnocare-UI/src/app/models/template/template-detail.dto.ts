/**
 * Full template detail returned by GET /api/template/GetById?id=X.
 *
 * The backend pre-populates all {{PLACEHOLDER}} tokens in htmlBody
 * (e.g. {{PATIENT_NAME}}, {{PATHOLOGY_NAME}}, {{TEST_PARAMETERS_TABLE}} …)
 * with real pathology / patient / test / doctor data before responding.
 *
 * The frontend reconstructs the renderable document as:
 *   fullHtml = htmlBody.replace('{{CSS_STYLES}}', cssStyles)
 */
export interface TemplateDetailDTO {
  templateId: number;
  templateName: string;
  description?: string;
  category?: string;
  /**
   * Complete HTML document string containing a {{CSS_STYLES}} placeholder
   * inside its <style> tag.  All other data-placeholders are already
   * resolved by the backend.
   */
  htmlBody: string;
  /**
   * Raw CSS text that is substituted in place of {{CSS_STYLES}}.
   */
  cssStyles: string;
}
