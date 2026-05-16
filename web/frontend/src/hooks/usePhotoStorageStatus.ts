import { useEffect, useState } from "react";
import { isRemotePhotoStorageAvailable } from "../lib/photoUpload";
import { isApiConfigured } from "../lib/runtimeConfig";

export type PhotoStorageStatus = "loading" | "ok" | "disabled" | "offline";

export function usePhotoStorageStatus(): PhotoStorageStatus {
  const [status, setStatus] = useState<PhotoStorageStatus>(() =>
    isApiConfigured ? "loading" : "offline"
  );

  useEffect(() => {
    if (!isApiConfigured) {
      setStatus("offline");
      return;
    }
    let cancelled = false;
    void (async () => {
      setStatus("loading");
      try {
        const ok = await isRemotePhotoStorageAvailable();
        if (!cancelled) setStatus(ok ? "ok" : "disabled");
      } catch {
        if (!cancelled) setStatus("disabled");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
