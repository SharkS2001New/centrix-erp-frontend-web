"use client";

function GuideStep({ number, title, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#185FA5]/10 text-xs font-semibold text-[#185FA5]">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
        <div className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
      </div>
    </li>
  );
}

function FieldHint({ label, children }) {
  return (
    <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <span className="font-medium text-slate-800 dark:text-slate-100">{label}:</span> {children}
    </p>
  );
}

const ANDROID_APPS = [
  { name: "Centrix Manager", packageName: "com.centrix.centrix_manager_app" },
  { name: "Centrix Mobile (field sales)", packageName: "com.centrix.mobile" },
];

const IOS_APPS = [
  { name: "Centrix Manager", bundleId: "com.centrix.centrixManagerApp" },
  { name: "Centrix Mobile (field sales)", bundleId: "com.centrix.mobile" },
];

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function PlatformFcmSetupGuideModal({ open, onClose }) {
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
        aria-labelledby="fcm-setup-guide-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="fcm-setup-guide-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              How to set up mobile push notifications
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Firebase Cloud Messaging (FCM) is <strong>free</strong>. One Firebase project powers both Centrix
              Manager and Centrix Mobile. You configure the server here; your mobile developer wires the apps once.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          <strong>What you get:</strong> Managers receive instant alerts for pending approvals. Field sales reps
          receive instant alerts when a discount request is approved or rejected — even when the app is in the
          background.
        </div>

        <ol className="space-y-5">
          <GuideStep number="1" title="Create a Firebase project">
            Open the{" "}
            <a
              href="https://console.firebase.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#185FA5] hover:underline"
            >
              Firebase Console
            </a>{" "}
            and click <strong>Add project</strong>. Name it e.g. <em>Centrix Production</em>. Google Analytics is
            optional.
          </GuideStep>

          <GuideStep number="2" title="Register both Android apps (same project)">
            On the project overview, click <strong>Add app → Android</strong> for each app:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {ANDROID_APPS.map((app) => (
                <li key={app.packageName}>
                  <strong>{app.name}</strong> — package name{" "}
                  <code className="rounded bg-slate-100 px-1 text-[11px] dark:bg-slate-800">{app.packageName}</code>
                </li>
              ))}
            </ul>
            <FieldHint label="Download google-services.json">
              After each Android app is registered, download <code>google-services.json</code> and give it to your
              mobile developer. They place it in the matching app folder before building a release.
            </FieldHint>
          </GuideStep>

          <GuideStep number="3" title="Register iOS apps (if you ship on iPhone)">
            Add an iOS app for each product with these bundle IDs:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {IOS_APPS.map((app) => (
                <li key={app.bundleId}>
                  <strong>{app.name}</strong> —{" "}
                  <code className="rounded bg-slate-100 px-1 text-[11px] dark:bg-slate-800">{app.bundleId}</code>
                </li>
              ))}
            </ul>
            Download <code>GoogleService-Info.plist</code> for each and hand off to your mobile developer. Push on
            iOS requires a physical device and Apple Push Notifications enabled in Xcode.
          </GuideStep>

          <GuideStep number="4" title="Note your Firebase project ID">
            In Firebase → <strong>Project settings</strong> (gear icon), copy the <strong>Project ID</strong>{" "}
            (e.g. <code>centrix-production</code>). Paste it into the <strong>Firebase project ID</strong> field on
            this page.
          </GuideStep>

          <GuideStep number="5" title="Create a Google service account key">
            Open{" "}
            <a
              href="https://console.cloud.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#185FA5] hover:underline"
            >
              Google Cloud Console
            </a>{" "}
            and select the <strong>same project</strong> as Firebase.
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>IAM & Admin → Service Accounts</strong> → Create service account (e.g.{" "}
                <em>centrix-fcm</em>)
              </li>
              <li>
                Open the account → <strong>Keys</strong> → <strong>Add key → JSON</strong> → download the file
              </li>
              <li>
                <strong>APIs & Services → Library</strong> → search <strong>Firebase Cloud Messaging API</strong> →
                Enable
              </li>
            </ul>
            <FieldHint label="Security">
              Treat the JSON file like a password. Only paste it here or on the server — never commit it to git or
              share it in chat.
            </FieldHint>
          </GuideStep>

          <GuideStep number="6" title="Save settings in Centrix">
            Back on <strong>Platform → Mobile push</strong>:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Turn on <strong>Enable push notifications</strong></li>
              <li>Paste your <strong>Firebase project ID</strong></li>
              <li>Open the downloaded JSON file in a text editor, copy the entire contents, and paste into{" "}
                <strong>Service account JSON</strong></li>
              <li>Click <strong>Save push settings</strong></li>
            </ul>
            Diagnostics should show <strong>Ready</strong> when OAuth and credentials are valid.
          </GuideStep>

          <GuideStep number="7" title="Have users log in on their phones">
            Push only works after a real device registers a token:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Manager users</strong> — install Centrix Manager, log in, allow notifications when prompted
              </li>
              <li>
                <strong>Sales reps</strong> — install Centrix Mobile, log in, allow notifications when prompted
              </li>
            </ul>
            On Android 13+, users must grant notification permission in system settings if they declined initially.
          </GuideStep>

          <GuideStep number="8" title="Send a test push">
            Find the user&apos;s numeric ID (Platform → Active users, or your user admin list). Enter it in{" "}
            <strong>Send test push</strong>, pick the app channel, and click send. The device should show a test
            notification within a few seconds.
          </GuideStep>

          <GuideStep number="9" title="Verify a real approval flow">
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Create a discount or action that needs manager approval → manager should get a push on Centrix
                Manager
              </li>
              <li>
                Approve or reject it → the sales rep who requested it should get a push on Centrix Mobile
              </li>
            </ul>
          </GuideStep>
        </ol>

        <div className="mt-5 space-y-3">
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <strong>For your mobile developer:</strong> Run <code>flutterfire configure</code> in each app repo
            (Manager and Mobile) using the same Firebase project. Rebuild and distribute the apps after{" "}
            <code>google-services.json</code> / plist files are in place.
          </p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Troubleshooting:</strong> If diagnostics show OAuth failed, confirm the FCM API is enabled and
            the JSON key is from the correct project. If test push finds no tokens, the user must open the app and
            log in again. Tokens starting with <code>mgr-local-</code> or <code>mob-local-</code> are dev placeholders
            — keep &quot;Ignore local dev tokens&quot; enabled on production.
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

export function PlatformFcmSetupGuideTrigger({ onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm font-medium text-[#185FA5] hover:underline ${className}`}
    >
      Setup guide →
    </button>
  );
}
