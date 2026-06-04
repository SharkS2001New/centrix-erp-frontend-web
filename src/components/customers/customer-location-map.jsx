"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_MAP_CENTER } from "@/lib/customer-location";

import "leaflet/dist/leaflet.css";

const NAIROBI = [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];

const RED_PIN_HTML = `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z" fill="#E11900"/>
  <circle cx="18" cy="18" r="8" fill="#ffffff"/>
  <circle cx="18" cy="18" r="4" fill="#E11900"/>
</svg>`;

function redMarkerIcon(L) {
  return L.divIcon({
    html: RED_PIN_HTML,
    className: "customer-map-pin-icon",
    iconSize: [36, 46],
    iconAnchor: [18, 46],
    popupAnchor: [0, -42],
  });
}

function parseCoords(latitude, longitude) {
  const lat = latitude != null && latitude !== "" ? Number(latitude) : null;
  const lng = longitude != null && longitude !== "" ? Number(longitude) : null;
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
  return { lat, lng, hasPoint };
}

export default function CustomerLocationMap({
  latitude,
  longitude,
  interactive = true,
  onPick,
  heightClass = "h-56",
}) {
  const wrapRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);

  onPickRef.current = onPick;

  const { lat, lng, hasPoint } = parseCoords(latitude, longitude);

  useEffect(() => {
    let destroyed = false;
    let map = null;

    async function init() {
      const L = (await import("leaflet")).default;
      const el = containerRef.current;
      if (destroyed || !el) return;

      map = L.map(el, {
        scrollWheelZoom: interactive,
        dragging: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        zoomControl: interactive,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      const placeMarker = (mLat, mLng) => {
        if (!map) return;
        if (markerRef.current) {
          markerRef.current.setLatLng([mLat, mLng]);
        } else {
          markerRef.current = L.marker([mLat, mLng], { icon: redMarkerIcon(L) }).addTo(map);
        }
      };

      map.setView(hasPoint ? [lat, lng] : NAIROBI, hasPoint ? 16 : 12);
      if (hasPoint) placeMarker(lat, lng);

      if (interactive) {
        map.on("click", (e) => {
          const { lat: cLat, lng: cLng } = e.latlng;
          placeMarker(cLat, cLng);
          onPickRef.current?.(cLat, cLng);
        });
      }

      const resize = () => {
        if (map && !map._removed) map.invalidateSize();
      };
      resize();
      requestAnimationFrame(resize);
      setTimeout(resize, 250);

      if (wrapRef.current && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(resize);
        ro.observe(wrapRef.current);
        map._resizeObserver = ro;
      }
    }

    init();

    return () => {
      destroyed = true;
      const m = mapRef.current;
      if (m) {
        if (m._resizeObserver) m._resizeObserver.disconnect();
        m.off();
        m.remove();
      }
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || map._removed) return;

    import("leaflet").then((mod) => {
      const L = mod.default;
      const m = mapRef.current;
      if (!m || m._removed) return;

      if (hasPoint) {
        m.setView([lat, lng], Math.max(m.getZoom() || 12, 15), { animate: false });
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { icon: redMarkerIcon(L) }).addTo(m);
        }
      } else if (markerRef.current) {
        m.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      m.invalidateSize();
    });
  }, [lat, lng, hasPoint]);

  return (
    <div ref={wrapRef} className="w-full">
      <div
        className={`${heightClass} min-h-[12rem] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100`}
      >
        <div ref={containerRef} className="h-full min-h-[12rem] w-full" />
      </div>
      <p className="mt-1 text-right text-[10px] text-slate-400">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-600"
        >
          © OpenStreetMap
        </a>
      </p>
    </div>
  );
}
