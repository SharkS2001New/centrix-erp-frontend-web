/**
 * Browser WebAuthn helpers (GitHub-style passkeys).
 * Converts base64url JSON from the API into ArrayBuffers for navigator.credentials.
 */

function base64UrlToBuffer(value) {
  const padded = String(value ?? "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function copyCreationOptions(options) {
  const pubKey = structuredClone(options);
  pubKey.challenge = base64UrlToBuffer(pubKey.challenge);
  if (pubKey.user?.id) {
    pubKey.user.id = base64UrlToBuffer(pubKey.user.id);
  }
  if (Array.isArray(pubKey.excludeCredentials)) {
    pubKey.excludeCredentials = pubKey.excludeCredentials.map((c) => ({
      ...c,
      id: base64UrlToBuffer(c.id),
    }));
  }
  return pubKey;
}

function copyRequestOptions(options) {
  const pubKey = structuredClone(options);
  pubKey.challenge = base64UrlToBuffer(pubKey.challenge);
  if (Array.isArray(pubKey.allowCredentials)) {
    pubKey.allowCredentials = pubKey.allowCredentials.map((c) => ({
      ...c,
      id: base64UrlToBuffer(c.id),
    }));
  }
  return pubKey;
}

function credentialToJson(credential) {
  const response = credential.response;
  const json = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
    },
  };

  if (response.attestationObject) {
    json.response.attestationObject = bufferToBase64Url(response.attestationObject);
    json.response.transports = response.getTransports?.() ?? [];
  }
  if (response.authenticatorData) {
    json.response.authenticatorData = bufferToBase64Url(response.authenticatorData);
  }
  if (response.signature) {
    json.response.signature = bufferToBase64Url(response.signature);
  }
  if (response.userHandle) {
    json.response.userHandle = bufferToBase64Url(response.userHandle);
  }

  return json;
}

export function webAuthnSupported() {
  return typeof window !== "undefined"
    && typeof window.PublicKeyCredential !== "undefined"
    && typeof navigator.credentials?.create === "function"
    && typeof navigator.credentials?.get === "function"
    && window.isSecureContext;
}

export async function createPasskeyCredential(options) {
  const credential = await navigator.credentials.create({
    publicKey: copyCreationOptions(options),
  });
  if (!credential) {
    throw new Error("Passkey creation was cancelled.");
  }
  return credentialToJson(credential);
}

export async function getPasskeyAssertion(options) {
  const credential = await navigator.credentials.get({
    publicKey: copyRequestOptions(options),
  });
  if (!credential) {
    throw new Error("Passkey sign-in was cancelled.");
  }
  return credentialToJson(credential);
}
