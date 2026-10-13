import { useEffect, useState } from "preact/hooks";
import { t, type Lang } from "../i18n";
import { fetchShard, type SourceStatus as Status } from "../lib/feed";
import { ago } from "../lib/format";

// Expected maximum gap between successful runs, per source.
const EXPECTED_MS: Record<string, number> = { polisen: 15 * 60_000, smhi: 30 * 60_000, trafikverket: 10 * 60_000 };
const ORDER = ["polisen", "trafikverket", "smhi"];

export default function SourceStatus({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [sources, setSources] = useState<Record<string, Status> | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetchShard("live")
      .then((s) => {
        setSources(s.sources);
        setNow(Date.now());
      })
      .catch(() => setSources({}));
  }, []);

  if (!sources) return <p class="muted">{tr.loading}</p>;

  return (
    <ul class="source-status">
      {ORDER.filter((id) => sources[id]).map((id) => {
        const s = sources[id];
        const late = !s.ok || now - s.ok > (EXPECTED_MS[id] ?? 30 * 60_000);
        const state = s.fails >= 3 ? "down" : late ? "delayed" : "ok";
        return (
          <li data-state={state}>
            <span class="status-dot" aria-hidden="true" />
            <strong>{tr.sources[id] ?? id}</strong>
            <span class="muted">
              {state === "ok" ? tr.statusOk : state === "delayed" ? tr.statusDelayed : tr.statusDown}
              {s.ok ? ` · ${tr.lastSuccess} ${ago(lang, s.ok, now)}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
