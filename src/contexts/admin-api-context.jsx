"use client";

import { createContext, useContext, useMemo } from "react";
import { apiBaseOrigin } from "@/lib/api";
import { capabilitiesFromOrganizationPayload } from "@/lib/org-settings-tabs";

const AdminApiContext = createContext({
  apiPrefix: "",
  organizationId: null,
  isPlatformManaged: false,
  tenantCapabilities: null,
  organizationProfile: null,
  adminPath: (path) => path,
  organizationPath: (suffix = "") => "/organizations",
  logoUploadPath: (organizationId) => `/organizations/${organizationId}/logo`,
  logoFileUrl: (organizationId) => `/api/v1/organizations/${organizationId}/logo/file`,
});

/** @param {{ apiPrefix?: string, organizationId?: number|string|null, orgPayload?: object|null, children: import("react").ReactNode }} props */
export function AdminApiProvider({ apiPrefix = "", organizationId = null, orgPayload = null, children }) {
  const tenantCapabilities = useMemo(
    () => (orgPayload ? capabilitiesFromOrganizationPayload(orgPayload) : null),
    [orgPayload],
  );

  const value = useMemo(
    () => ({
      apiPrefix,
      organizationId: organizationId ?? null,
      isPlatformManaged: Boolean(apiPrefix),
      tenantCapabilities,
      organizationProfile: orgPayload?.organization ?? null,
      adminPath: (path) => (apiPrefix ? `${apiPrefix}${path}` : path),
      organizationPath: (suffix = "") =>
        apiPrefix ? `${apiPrefix}${suffix}` : `/organizations${suffix}`,
      logoUploadPath: (orgId) =>
        apiPrefix ? `${apiPrefix}/logo` : `/organizations/${orgId}/logo`,
      logoFileUrl: (orgId) =>
        apiPrefix
          ? `${apiBaseOrigin()}/api/v1${apiPrefix}/logo/file`
          : `${apiBaseOrigin()}/api/v1/organizations/${orgId}/logo/file`,
    }),
    [apiPrefix, organizationId, tenantCapabilities],
  );

  return <AdminApiContext.Provider value={value}>{children}</AdminApiContext.Provider>;
}

export function useAdminApi() {
  return useContext(AdminApiContext);
}
