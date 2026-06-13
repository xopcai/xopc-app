import { LIST_DELETE_UNDO_MS } from './list-interaction';

/** Default toast duration for general feedback. */
export const TOAST_DURATION_DEFAULT = 2500;

/** Short confirmation (archive, toggle, copy). */
export const TOAST_DURATION_SHORT = 2200;

/** Longer messages (errors, scan results, attachments). */
export const TOAST_DURATION_LONG = 3200;

/** Route / gateway status toasts. */
export const TOAST_DURATION_STATUS = 3500;

/** Undo window — must match delete-undo snackbar timing. */
export const TOAST_DURATION_UNDO = LIST_DELETE_UNDO_MS;

/** Extra lift when a floating bottom bar or composer is visible (~44px bar + padding). */
export const TOAST_BOTTOM_LIFT_ABOVE_BAR = 58;
