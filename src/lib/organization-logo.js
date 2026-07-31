import { organizationLogoFileUrl } from "@/lib/api";
import { apiFetchCredentials } from "@/lib/auth-config";
import { getToken } from "@/lib/auth-storage";
import { organizationHasLogo } from "@/lib/reports/report-branding";

/**
 * Fetch the org logo as a data URL so print HTML / iframes do not need a Bearer token.
 * Auth-protected `/logo/file` URLs will not render inside srcDoc iframes or print agent HTML.
 */
export async function fetchOrganizationLogoDataUrl(organization) {
  if (!organization?.id || !organizationHasLogo(organization)) return null;
  const url = organizationLogoFileUrl(organization.id, {
    filePath: organization.logo_file_path ?? undefined,
  });
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers, credentials: apiFetchCredentials() });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
