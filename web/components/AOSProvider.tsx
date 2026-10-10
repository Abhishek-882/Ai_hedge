"use client";

import React, { useEffect, Suspense } from "react";
import { usePathname } from "next/navigation";
import AOS from "aos";
import "aos/dist/aos.css";

function AOSRouteWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    // Re-scans DOM and updates cached element offsets on route changes
    if (typeof window !== "undefined") {
      AOS.refreshHard();
    }
  }, [pathname]);

  return null;
}

export function AOSProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    AOS.init({
      once: true,
      duration: 600,
      easing: "ease-out-cubic",
      disable: "mobile",
    });
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <AOSRouteWatcher />
      </Suspense>
      {children}
    </>
  );
}

export default AOSProvider;
