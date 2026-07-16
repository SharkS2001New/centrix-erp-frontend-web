/**
 * Industry families for org provisioning — mirrors backend config/erp_industries.php.
 */

export const DEFAULT_INDUSTRY = "commerce";

export const INDUSTRIES = [
  {
    id: "commerce",
    label: "Retail & Distribution",
    description: "Shops, wholesale, supermarket, and logistics / distribution.",
    defaultProfile: "wholesale_retail",
    profileKeys: ["small_shop", "wholesale_retail", "supermarket", "distribution", "custom"],
  },
  {
    id: "hospitality",
    label: "Hotel & Hospitality",
    description: "Hotels, lodges, bars, restaurants, and guest operations.",
    defaultProfile: "hotel_bar",
    profileKeys: ["hotel_bar"],
  },
];

export function industryById(industryId) {
  return INDUSTRIES.find((item) => item.id === industryId) ?? null;
}

export function industryForProfile(profileKey, industries = INDUSTRIES, profilePresets = []) {
  if (!profileKey) return industries[0]?.id ?? DEFAULT_INDUSTRY;
  const fromPreset = profilePresets.find((p) => p.key === profileKey)?.industry;
  if (fromPreset) return fromPreset;
  for (const industry of industries) {
    if ((industry.profile_keys ?? industry.profileKeys ?? []).includes(profileKey)) {
      return industry.id;
    }
  }
  return industries[0]?.id ?? DEFAULT_INDUSTRY;
}

/** @deprecated Prefer industryForProfile — kept for call sites that use this name. */
export function resolveIndustryFromProfile(profileKey, profilePresets = [], industries = INDUSTRIES) {
  return industryForProfile(profileKey, industries, profilePresets);
}

export function profilesForIndustry(profilePresets, industryId, industries = INDUSTRIES) {
  const industry = (industries.length ? industries : INDUSTRIES).find((item) => item.id === industryId);
  const keys = industry?.profile_keys ?? industry?.profileKeys ?? [];
  if (!keys.length) {
    return profilePresets.filter((profile) => !profile.industry || profile.industry === industryId);
  }
  const allowed = new Set(keys);
  return profilePresets.filter((profile) => {
    if (profile.industry) return profile.industry === industryId;
    return allowed.has(profile.key);
  });
}

export function defaultProfileForIndustry(industryId, industries = INDUSTRIES) {
  const industry = (industries.length ? industries : INDUSTRIES).find((item) => item.id === industryId);
  return industry?.default_profile ?? industry?.defaultProfile ?? "wholesale_retail";
}

/** Normalize API industry payloads into the shape used by the UI. */
export function normalizeIndustries(apiIndustries) {
  if (!Array.isArray(apiIndustries) || apiIndustries.length === 0) {
    return INDUSTRIES;
  }
  return apiIndustries.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description ?? "",
    defaultProfile: item.default_profile ?? item.defaultProfile,
    profileKeys: item.profile_keys ?? item.profileKeys ?? [],
    permissionApplicationIds: item.permission_application_ids ?? item.permissionApplicationIds ?? [],
  }));
}
