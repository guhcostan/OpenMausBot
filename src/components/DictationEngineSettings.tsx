// Security: the harness keeps the speech server key; the renderer sends it once to PUT /api/config and never reads it back.
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { api, useStore, type ConfigStatus } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export function DictationEngineSettings({ appleAvailable }: { appleAvailable: boolean }) {
  const { state, dispatch } = useStore();
  const stt = state.config?.stt;
  const engine = stt?.engine ?? "apple";

  const [url, setUrl] = useState("");
  const [model, setModel] = useState("");
  const [language, setLanguage] = useState("");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUrl(stt?.url ?? "");
    setModel(stt?.model ?? "");
    setLanguage(stt?.language ?? "");
  }, [stt?.url, stt?.model, stt?.language]);

  const save = (patch: Record<string, string>) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    api("/api/config", { method: "PUT", body: JSON.stringify({ stt: patch }) })
      .then((status: ConfigStatus) => {
        dispatch({ type: "configStatus", config: status });
        setKey("");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  const saveServer = () => {
    const nextKey = key.trim();
    save({
      engine: "openai-compatible",
      url: url.trim(),
      model: model.trim(),
      language: language.trim(),
      ...(nextKey ? { key: nextKey } : {}),
    });
  };

  return (
    <div className="mt-4 border-t border-hairline/40 pt-4">
      <div className="text-[13px] font-medium text-ink">{t("stt.title")}</div>
      <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-secondary">{t("stt.description")}</div>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-inset p-1" role="radiogroup" aria-label={t("stt.title")}>
        {([
          { value: "apple", label: t("stt.engine.apple"), available: appleAvailable },
          { value: "openai-compatible", label: t("stt.engine.openaiCompatible"), available: true },
        ] as const).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={engine === option.value}
            disabled={saving || !option.available}
            title={!option.available ? t("stt.engine.appleOnly") : undefined}
            onClick={() => engine !== option.value && save({ engine: option.value })}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[12.5px] transition-colors disabled:opacity-50",
              engine === option.value ? "bg-raised text-ink shadow" : "text-ink-secondary hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {engine === "openai-compatible" && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
            <span className={cn("size-1.5 rounded-full", stt?.ready ? "bg-success" : "bg-raised-hover")} />
            <span>{stt?.ready ? t("stt.ready") : t("stt.notReady")}</span>
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://127.0.0.1:8080/v1"
            aria-label={t("stt.url")}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="whisper-1"
              aria-label={t("stt.model")}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
            />
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder={t("stt.languagePlaceholder")}
              aria-label={t("stt.language")}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
            />
          </div>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveServer()}
            placeholder={stt?.keyConfigured ? "••••••••  (paste to replace)" : t("stt.keyOptional")}
            aria-label={t("stt.keyLabel")}
            autoComplete="off"
            className="w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            {stt?.keyConfigured ? (
              <button
                type="button"
                onClick={() => save({ key: "" })}
                disabled={saving}
                className="text-[12px] font-medium text-danger hover:underline disabled:opacity-50"
              >
                {t("stt.removeKey")}
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={saveServer}
              disabled={saving}
              className="flex w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-control py-2 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} />{t("common.save")}</>}
            </button>
          </div>
          <div className="text-[11.5px] leading-relaxed text-ink-secondary">{t("stt.help")}</div>
        </div>
      )}

      {error && <div role="alert" className="mt-2 text-[12px] text-danger">{error}</div>}
    </div>
  );
}
