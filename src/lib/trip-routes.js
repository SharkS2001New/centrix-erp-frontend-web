export function formatTripRoutesLabel(trip, routesById = null) {
  const names = Array.isArray(trip?.route_names)
    ? trip.route_names.filter(Boolean)
    : [];
  if (names.length > 1) {
    return names.join(" · ");
  }
  if (names.length === 1) {
    return names[0];
  }
  if (trip?.route?.route_name) {
    return trip.route.route_name;
  }
  const routeId = trip?.route_id;
  if (routeId != null && routesById?.has(routeId)) {
    return routesById.get(routeId).route_name ?? `Route #${routeId}`;
  }
  return "—";
}
