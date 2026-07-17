import Script from "next/script";

/**
 * After a deploy, open tabs can keep an old document that references
 * hashed chunks that no longer exist. Reload once so the browser fetches
 * fresh HTML + matching assets.
 */
const CHUNK_RELOAD_SCRIPT = `(function(){
  var k="centrix_chunk_reload";
  function isChunk(m){
    return /ChunkLoadError|Loading chunk .+ failed|Failed to fetch dynamically imported module/i.test(String(m||""));
  }
  function reloadOnce(){
    try{
      if(sessionStorage.getItem(k)==="1")return;
      sessionStorage.setItem(k,"1");
    }catch(e){}
    location.reload();
  }
  window.addEventListener("error",function(e){
    if(isChunk(e&&e.message)||isChunk(e&&e.error&&e.error.message))reloadOnce();
  });
  window.addEventListener("unhandledrejection",function(e){
    var r=e&&e.reason;
    if(isChunk(r&&r.message)||isChunk(r))reloadOnce();
  });
  try{
    if(sessionStorage.getItem(k)==="1"){
      setTimeout(function(){try{sessionStorage.removeItem(k);}catch(e){}},15000);
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
