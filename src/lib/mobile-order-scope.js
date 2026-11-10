export function userHasMobileChannel(loginChannels) {
  return (
    Array.isArray(loginChannels) &&
    (loginChannels.includes("mobile") || loginChannels.includes("centrix_as_mobile"))
  );
}
