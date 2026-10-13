import { defineSecret } from "firebase-functions/params";
import { logger, setGlobalOptions } from "firebase-functions";
import { onSchedule } from "firebase-functions/scheduler";
import { closeExpiredEvents, runPolisenJob, runSmhiJob, runTrafikverketJob } from "./jobs";
import { runIngest } from "./lib/store";
import { POLISEN_ATTRIBUTION } from "./sources/polisen";
import { SMHI_ATTRIBUTION } from "./sources/smhi";
import { TRAFIKVERKET_ATTRIBUTION } from "./sources/trafikverket";

// Cloud Scheduler is not available in europe-north1, so the functions run in
// europe-west1; Firestore (the data) lives in europe-north1.
export const REGION = "europe-west1";
const TIME_ZONE = "Europe/Stockholm";

setGlobalOptions({ region: REGION, maxInstances: 1, memory: "256MiB" });

const trafikverketApiKey = defineSecret("TRAFIKVERKET_API_KEY");

// Polisen allows max 60 calls/hour; this job makes 1–2 calls per run (see jobs.ts).
export const ingestPolisen = onSchedule(
  { schedule: "every 5 minutes", timeZone: TIME_ZONE, timeoutSeconds: 120, retryCount: 0 },
  () => runIngest("polisen", POLISEN_ATTRIBUTION, () => runPolisenJob()),
);

export const ingestSmhi = onSchedule(
  { schedule: "every 10 minutes", timeZone: TIME_ZONE, timeoutSeconds: 60, retryCount: 0 },
  () => runIngest("smhi", SMHI_ATTRIBUTION, () => runSmhiJob()),
);

export const ingestTrafikverket = onSchedule(
  {
    schedule: "every 2 minutes",
    timeZone: TIME_ZONE,
    timeoutSeconds: 300,
    memory: "512MiB",
    retryCount: 0,
    secrets: [trafikverketApiKey],
  },
  () => runIngest("trafikverket", TRAFIKVERKET_ATTRIBUTION, () => runTrafikverketJob(trafikverketApiKey.value())),
);

export const closeExpired = onSchedule(
  { schedule: "every 30 minutes", timeZone: TIME_ZONE, timeoutSeconds: 120, retryCount: 0 },
  async () => {
    const closed = await closeExpiredEvents();
    logger.info("closeExpired", { closed });
  },
);
