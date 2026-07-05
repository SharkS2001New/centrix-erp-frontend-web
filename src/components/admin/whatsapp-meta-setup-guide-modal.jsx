"use client";

function GuideStep({ number, title, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#185FA5]/10 text-xs font-semibold text-[#185FA5]">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <div className="mt-1 text-sm leading-relaxed text-slate-600">{children}</div>
      </div>
    </li>
  );
}

function FieldHint({ label, children }) {
  return (
    <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      <span className="font-medium text-slate-800">{label}:</span> {children}
    </p>
  );
}

/**
 * @param {{ open: boolean, onClose: () => void, webhookUrl?: string }} props
 */
export function WhatsappMetaSetupGuideModal({ open, onClose, webhookUrl = "" }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto theme-panel rounded-xl border p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-meta-guide-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="whatsapp-meta-guide-title" className="text-base font-semibold text-slate-900">
              How to register WhatsApp with Meta
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Follow these steps in Meta&apos;s developer console, then paste your keys into Centrix below.
              Each organization uses its own Meta app credentials; only the webhook URL is shared.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <ol className="space-y-5">
          <GuideStep number="1" title="Create or open a Meta Business account">
            Go to{" "}
            <a
              href="https://business.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#185FA5] hover:underline"
            >
              business.facebook.com
            </a>{" "}
            and sign in. You need a Business Portfolio to manage WhatsApp Business numbers.
          </GuideStep>

          <GuideStep number="2" title="Create a Meta Developer app">
            Open{" "}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#185FA5] hover:underline"
            >
              developers.facebook.com/apps
            </a>
            , click <strong>Create App</strong>, choose <strong>Business</strong> as the app type, and complete
            the setup wizard.
          </GuideStep>

          <GuideStep number="3" title="Add the WhatsApp product">
            In your app dashboard, click <strong>Add product</strong> → <strong>WhatsApp</strong> →{" "}
            <strong>Set up</strong>. Link the app to your Business Portfolio when prompted.
          </GuideStep>

          <GuideStep number="4" title="Add your business phone number">
            Under <strong>WhatsApp → API Setup</strong>, add a phone number (or use Meta&apos;s test number while
            developing). Complete SMS/voice verification. Note the display number customers will message.
            <FieldHint label="Centrix field">Display phone (optional) — for your own reference.</FieldHint>
          </GuideStep>

          <GuideStep number="5" title="Copy your Phone Number ID and WABA ID">
            Still on <strong>API Setup</strong>, find:
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>
                <strong>Phone number ID</strong> — next to your connected number (a long numeric ID).
              </li>
              <li>
                <strong>WhatsApp Business Account ID (WABA ID)</strong> — shown in the same section or under
                WhatsApp Manager.
              </li>
            </ul>
            <FieldHint label="Centrix fields">Phone number ID * and WABA ID (optional).</FieldHint>
          </GuideStep>

          <GuideStep number="6" title="Generate an access token">
            On <strong>API Setup</strong>, click <strong>Generate access token</strong> for a temporary token
            (good for testing), or create a <strong>System User</strong> in Business Settings with a permanent
            token for production.
            <FieldHint label="Centrix field">
              Meta access token * — paste the token starting with <code className="rounded bg-slate-100 px-1">EAA</code>.
              Keep it secret; Centrix stores it encrypted per organization.
            </FieldHint>
          </GuideStep>

          <GuideStep number="7" title="Configure the webhook in Meta">
            Go to <strong>WhatsApp → Configuration</strong> (or App → Webhooks → WhatsApp).
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>
                <strong>Callback URL</strong> — paste the Centrix webhook URL
                {webhookUrl ? (
                  <>
                    {" "}
                    (<code className="break-all rounded bg-slate-100 px-1 text-[11px]">{webhookUrl}</code>)
                  </>
                ) : (
                  " from the field above on this settings page"
                )}
                . Every organization uses the same URL.
              </li>
              <li>
                <strong>Verify token</strong> — ask your platform administrator for the shared verify token (set
                under Platform → WhatsApp).
              </li>
              <li>
                Click <strong>Verify and save</strong>, then subscribe to the <strong>messages</strong> field.
              </li>
            </ul>
          </GuideStep>

          <GuideStep number="8" title="Enter credentials in Centrix">
            Back on this page, enable WhatsApp ordering and fill in your Phone Number ID and access token. Then
            choose an <strong>order service account</strong> — an existing Centrix user in your organization (not
            a Meta bot). Centrix uses that login behind the scenes to create sales orders when customers order via
            WhatsApp.
            <FieldHint label="Recommended">
              Create a user such as <em>whatsapp_orders</em> with only the permissions needed to create sales
              orders. Orders will show in the system as created by that user.
            </FieldHint>
          </GuideStep>

          <GuideStep number="9" title="Test">
            Send a WhatsApp message to your business number (e.g. &quot;Hi&quot;). If configuration is correct,
            the order bot should reply. Check that the Phone Number ID in Centrix exactly matches Meta — that
            is how messages are routed to your organization.
          </GuideStep>
        </ol>

        <div className="mt-5 space-y-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <strong>Sandbox testing:</strong> Meta provides a test number and test recipients in API Setup. Use
            those while building; switch to your live number before going to customers.
          </p>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <strong>Multiple organizations (e.g. MOON, OMEGA):</strong> each company registers its own Meta app
            and phone number, pastes the same Centrix webhook URL, and enters its own Phone Number ID and token.
            Messages are separated automatically by phone number ID.
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#144f8a]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function WhatsappMetaSetupGuideTrigger({ onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm font-medium text-[#185FA5] hover:underline ${className}`}
    >
      How to register with Meta →
    </button>
  );
}
