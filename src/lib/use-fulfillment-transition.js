"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError, capturePodDelivery, isMissingProductWeightsError, missingProductWeightsFromError } from "@/lib/api";
import { fetchRoutesCached } from "@/lib/reference-data-cache";
import {
  buildFulfillmentTransitionBody,
  mergeDistributionSettings,
  shouldCheckProductWeights,
  shouldPromptFulfillmentAssignment,
  shouldPromptPodCapture,
  shouldShowOrderAssignAction,
} from "@/lib/distribution-settings";

export function useFulfillmentTransition({ capabilities, onSuccess, onError }) {
  const { user } = useAuth();
  const distributionSettings = useMemo(
    () => mergeDistributionSettings(capabilities),
    [capabilities],
  );
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [assignDialog, setAssignDialog] = useState(null);
  const [podDialog, setPodDialog] = useState(null);
  const [weightDialog, setWeightDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!distributionSettings.enabled) return;
    Promise.all([
      apiRequest("/drivers", { searchParams: { per_page: 200 } }),
      apiRequest("/vehicles", { searchParams: { per_page: 200 } }),
      fetchRoutesCached(user?.organization_id),
    ])
      .then(([driverRes, vehicleRes, routes]) => {
        setDrivers(driverRes.data ?? []);
        setVehicles(vehicleRes.data ?? []);
        setRoutes(routes ?? []);
      })
      .catch(() => {});
  }, [distributionSettings.enabled, user?.organization_id]);

  const openWeightDialog = useCallback((sale, targetStatus, products, fulfillmentMeta = null) => {
    setWeightDialog({
      sale,
      targetStatus,
      products,
      fulfillmentMeta,
    });
  }, []);

  const ensureProductWeights = useCallback(
    async (sale, targetStatus, fulfillmentMeta = null) => {
      if (!shouldCheckProductWeights(targetStatus, distributionSettings)) {
        return true;
      }

      try {
        const status = await apiRequest(`/sales/orders/${sale.id}/load-weight-status`);
        if (status?.ready) {
          return true;
        }
        openWeightDialog(sale, targetStatus, status?.missing_products ?? [], fulfillmentMeta);
        return false;
      } catch (e) {
        onError?.(e instanceof ApiError ? e.message : "Could not check product weights.");
        return false;
      }
    },
    [distributionSettings, onError, openWeightDialog],
  );

  const runTransition = useCallback(
    async (sale, targetStatus, fulfillmentMeta) => {
      if (!sale?.id) return null;
      setBusy(true);
      try {
        const meta = { ...(fulfillmentMeta ?? {}) };
        if (String(targetStatus).toLowerCase() === "delivered" && !meta.trip_id) {
          const tripId = sale?.fulfillment_meta?.trip_id;
          if (tripId) meta.trip_id = tripId;
        }

        if (shouldPromptPodCapture(targetStatus, distributionSettings) && meta?.pod_signer_name) {
          await capturePodDelivery(sale.id, {
            recipient_name: meta.pod_signer_name,
            notes: meta.pod_notes,
            trip_id: meta.trip_id,
            lines: meta.lines,
            photo: meta.photo,
            signature: meta.signature,
            gps_lat: meta.gps_lat,
            gps_lng: meta.gps_lng,
          });
        }

        const updated = await apiRequest(`/sales/orders/${sale.id}/transition`, {
          method: "POST",
          body: buildFulfillmentTransitionBody(targetStatus, meta),
        });
        onSuccess?.(updated, sale);
        setAssignDialog(null);
        setPodDialog(null);
        setWeightDialog(null);
        return updated;
      } catch (e) {
        if (isMissingProductWeightsError(e)) {
          openWeightDialog(
            sale,
            targetStatus,
            missingProductWeightsFromError(e),
            fulfillmentMeta,
          );
          return null;
        }
        const message = e instanceof ApiError ? e.message : "Could not update order.";
        onError?.(message);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [distributionSettings, onSuccess, onError, openWeightDialog],
  );

  const continueAfterWeights = useCallback(
    async (sale, targetStatus, fulfillmentMeta) => {
      setWeightDialog(null);
      if (shouldPromptFulfillmentAssignment(targetStatus, distributionSettings, sale)) {
        setAssignDialog({ sale, targetStatus, fulfillmentMeta });
        return;
      }
      if (shouldPromptPodCapture(targetStatus, distributionSettings)) {
        setPodDialog({ sale, targetStatus, fulfillmentMeta });
        return;
      }
      await runTransition(sale, targetStatus, fulfillmentMeta);
    },
    [distributionSettings, runTransition],
  );

  const requestTransition = useCallback(
    async (sale, targetStatus) => {
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

      const weightsReady = await ensureProductWeights(sale, targetStatus);
      if (!weightsReady) return;

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
    [distributionSettings, ensureProductWeights, runTransition, onSuccess],
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
    weightDialog,
    setAssignDialog,
    setPodDialog,
    setWeightDialog,
    busy,
    requestTransition,
    requestAssignment,
    runTransition,
    continueAfterWeights,
  };
}
