export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** Hide the cancel button, making the dialog a plain acknowledge-only alert. Defaults to true
   *  when cancelText is blank, so `cancelText: ''` also yields a single-button alert. */
  hideCancelButton?: boolean;
  /** When true, clicking Confirm shows a loading spinner instead of closing the modal.
   *  The caller must call dismiss() once the async operation completes. */
  showLoadingOnConfirm?: boolean;
  /** When true, the dialog shows a free-text reason field. Use confirmWithReason()
   *  to receive the entered value. */
  showReasonInput?: boolean;
  /** Label shown above the reason field. */
  reasonLabel?: string;
  /** Placeholder text inside the reason field. */
  reasonPlaceholder?: string;
  /** When true, Confirm is disabled until a non-empty reason is entered. */
  reasonRequired?: boolean;
}

/** Result of a dialog that captured a reason. */
export interface ConfirmResult {
  confirmed: boolean;
  reason: string;
}
