export function userHasMobileChannel(loginChannels) {
  return Array.isArray(loginChannels) && loginChannels.includes("mobile");
}
