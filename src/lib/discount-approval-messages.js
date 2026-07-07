export const DISCOUNT_ADVISED_REVISION_MESSAGE =
  "Order has been edited to apply the requested discount. Please check and confirm.";

export const DISCOUNT_GENERIC_REVISION_MESSAGE =
  "Order has been edited as requested. Please check and confirm.";

export function isAdvisedDiscountRevision(source) {
  return (
    source?.advised_discount_applied === true
    || source?.action_request?.payload?.advised_discount_applied === true
    || source?.discount_approval?.advised_discount_applied === true
  );
}

export function isDiscountRevisionSubmitted(source) {
  return (
    isAdvisedDiscountRevision(source)
    || source?.action_request?.payload?.discount_revision_submitted === true
    || source?.discount_approval?.discount_revision_submitted === true
  );
}

export function discountRevisionConfirmationMessage(source) {
  if (isAdvisedDiscountRevision(source)) {
    return DISCOUNT_ADVISED_REVISION_MESSAGE;
  }
  if (
    source?.action_request?.payload?.discount_revision_submitted === true
    || source?.discount_approval?.discount_revision_submitted === true
  ) {
    return DISCOUNT_GENERIC_REVISION_MESSAGE;
  }
  return null;
}
