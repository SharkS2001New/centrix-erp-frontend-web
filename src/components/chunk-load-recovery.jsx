import Script from "next/script";

/**
 * After a deploy (or a brief 502 on `/_next/static/chunks/*`), open tabs can keep
 * an old document that references hashed chunks that no longer load. Reload with
 * a cache-bust so the browser fetches fresh HTML + matching assets.
 *
 * Also covers React.lazy failures when opening tab screens (e.g. payroll run).
 */
const CHUNK_RELOAD_SCRIPT = `(function(){
  var k="centrix_chunk_reload";
  var max=2;
  function isChunk(m){
    return /ChunkLoadError|Loading chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(String(m||""));
  }
  function reloadSoon(){
    try{
      var n=Number(sessionStorage.getItem(k)||"0");
      if(n>=max)return;
      sessionStorage.setItem(k,String(n+1));
    }catch(e){return;}
    try{
      var u=new URL(location.href);
      u.searchParams.set("_cr",String(Date.now()));
      location.replace(u.href);
    }catch(e){
      location.reload();
    }
  }
  window.addEventListener("error",function(e){
    if(isChunk(e&&e.message)||isChunk(e&&e.error&&e.error.message))reloadSoon();
  });
  window.addEventListener("unhandledrejection",function(e){
    var r=e&&e.reason;
    if(isChunk(r&&r.message)||isChunk(r))reloadSoon();
  });
  try{
    if(sessionStorage.getItem(k)){
      setTimeout(function(){try{sessionStorage.removeItem(k);}catch(e){}},20000);
    }
    var u=new URL(location.href);
    if(u.searchParams.has("_cr")){
      u.searchParams.delete("_cr");
      history.replaceState(null,"",u.pathname+u.search+u.hash);
    }
  }catch(e){}
})();`;

export function ChunkLoadRecovery() {
  return (
    <Script id="chunk-load-recovery" strategy="beforeInteractive">
      {CHUNK_RELOAD_SCRIPT}
    </Script>
  );
}

/** @param {unknown} error */
export function isChunkLoadError(error) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");
  return /ChunkLoadError|Loading chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    message,
  );
}

/**
 * Hard-reload the current page (cache-bust query).
 * @param {{ resetCounter?: boolean }} [options]
 *   resetCounter: clear retry budget (manual "Reload" only). Auto-recovery must not reset.
 */
export function reloadForChunkLoad(options = {}) {
  const { resetCounter = false } = options;
  if (resetCounter) {
    try {
      sessionStorage.removeItem("centrix_chunk_reload");
    } catch {
      /* ignore */
    }
  }
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("_cr", String(Date.now()));
    window.location.replace(u.href);
  } catch {
    window.location.reload();
  }
}
