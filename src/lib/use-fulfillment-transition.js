"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError, capturePodDelivery } from "@/lib/api";
import { fetchRoutesCached } from "@/lib/reference-data-cache";
import {
  buildFulfillmentTransitionBody,
  mergeDistributionSettings,
  shouldPromptFulfillmentAssignment,
  shouldPromptPodCapture,
  shouldShowOrderAssignAction,
} from "@/lib/distribution-settings";

export function useFulfillmentTransition({ capabilities, onSuccess, onError }) {
  const distributionSettings = useMemo(
    () => mergeDistributionSettings(capabilities),
    [capabilities],
  );
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [assignDialog, setAssignDialog] = useState(null);
  const [podDialog, setPodDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!distributionSettings.enabled) return;
    Promise.all([
      apiRequest("/drivers", { searchParams: { per_page: 200 } }),
      apiRequest("/vehicles", { searchParams: { per_page: 200 } }),
      fetchRoutesCached(),
    ])
      .then(([driverRes, vehicleRes, routes]) => {
        setDrivers(driverRes.data ?? []);
        setVehicles(vehicleRes.data ?? []);
        setRoutes(routes ?? []);
      })
      .catch(() => {});
  }, [distributionSettings.enabled]);

  const runTransition = useCallback(
    async (sale, targetStatus, fulfillmentMeta) => {
      if (!sale?.id) return null;
      setBusy(true);
      try {
        if (shouldPromptPodCapture(targetStatus, distributionSettings) && fulfillmentMeta?.pod_signer_name) {
          await capturePodDelivery(sale.id, {
            recipient_name: fulfillmentMeta.pod_signer_name,
            notes: fulfillmentMeta.pod_notes,
            trip_id: fulfillmentMeta.trip_id,
            lines: fulfillmentMeta.lines,
            photo: fulfillmentMeta.photo,
            signature: fulfillmentMeta.signature,
            gps_lat: fulfillmentMeta.gps_lat,
            gps_lng: fulfillmentMeta.gps_lng,
          });
        }

        const updated = await apiRequest(`/sales/orders/${sale.id}/transition`, {
          method: "POST",
          body: buildFulfillmentTransitionBody(targetStatus, fulfillmentMeta),
        });
        onSuccess?.(updated, sale);
        setAssignDialog(null);
        setPodDialog(null);
        return updated;
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Could not update order.";
        onError?.(message);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [distributionSettings, onSuccess, onError],
  );

  const requestTransition = useCallback(
    (sale, targetStatus) => {
      if (targetStatus === "cancelled") {
        void runTransition(sale, targetStatus);
        return;
      }

      const current = String(sale?.status ?? "").toLowerCase();
      const target = String(targetStatus ?? "").toLowerCase();

      if (current === target) {
        if (shouldPromptFulfillmentAssignment(targetStatus, distributionSettings, sale)) {
          setAssignDialog({ sale, targetStatus, assignOnly: true });
          return;
        }
        onSuccess?.(sale, sale);
        return;
      }

      if (shouldPromptFulfillmentAssignment(targetStatus, distributionSettings, sale)) {
        setAssignDialog({ sale, targetStatus });
        return;
      }
      if (shouldPromptPodCapture(targetStatus, distributionSettings)) {
        setPodDialog({ sale, targetStatus });
        return;
      }
      void runTransition(sale, targetStatus);
    },
    [distributionSettings, runTransition, onSuccess],
  );

  const requestAssignment = useCallback(
    (sale) => {
      if (!sale?.id || !shouldShowOrderAssignAction(sale, distributionSettings)) return;

      const assignStatus = distributionSettings.assignOnStatus || "processed";
      const current = String(sale.status ?? "").toLowerCase();

      if (current === assignStatus) {
        setAssignDialog({ sale, targetStatus: assignStatus, assignOnly: true });
        return;
      }

      requestTransition(sale, assignStatus);
    },
    [distributionSettings, requestTransition],
  );

  return {
    distributionSettings,
    drivers,
    vehicles,
    routes,
    assignDialog,
    podDialog,
    setAssignDialog,
    setPodDialog,
    busy,
    requestTransition,
    requestAssignment,
    runTransition,
  };
}
