"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { haptics } from "@/lib/haptics";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type TeamAdminRecord = {
  id: string;
  team_id: string | null;
  email: string | null;
  active: boolean | null;
  terminated: boolean | null;
  deactivated: boolean | null;
  document_url: string | null;
  final_key: string | null;
  session_start: string | null;
  session_end: string | null;
  attempts: number | null;
  completed: boolean | null;
  completion_time: string | null;
  max_attempts: number | null;
  is_admin: boolean | null;
};

type SubmissionLog = {
  id: string;
  team_id: string | null;
  submitted_key: string | null;
  correct: boolean | null;
  created_at: string | null;
};

type Toast = { id: number; message: string; type: "success" | "error" };

/* ------------------------------------------------------------------ */
/*  Supabase client                                                    */
/* ------------------------------------------------------------------ */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const adminEmailSet = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
);

const TEAM_COLS =
  "id, team_id, email, active, terminated, deactivated, document_url, final_key, session_start, session_end, attempts, completed, completion_time, max_attempts, is_admin";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function formatCountdown(sessionEnd: string | null): string {
  if (!sessionEnd) return "--:--:--";
  const diff = Math.max(0, new Date(sessionEnd).getTime() - Date.now());
  if (diff <= 0) return "00:00:00";
  const s = Math.floor(diff / 1000);
  return [
    String(Math.floor(s / 3600)).padStart(2, "0"),
    String(Math.floor((s % 3600) / 60)).padStart(2, "0"),
    String(s % 60).padStart(2, "0"),
  ].join(":");
}

function getSecondsLeft(sessionEnd: string | null): number {
  if (!sessionEnd) return 0;
  return Math.max(0, Math.floor((new Date(sessionEnd).getTime() - Date.now()) / 1000));
}

type Status = "Standby" | "Active" | "Survived" | "Deactivated" | "Terminated";

function deriveStatus(t: TeamAdminRecord): Status {
  if (t.completed) return "Survived";
  if (t.terminated) return "Terminated";
  if (t.deactivated) return "Deactivated";
  if (!t.active) return "Standby";
  if (t.session_end && new Date(t.session_end).getTime() <= Date.now()) return "Deactivated";
  return "Active";
}

function computeDuration(t: TeamAdminRecord): number | null {
  if (!t.completed || !t.completion_time || !t.session_start) return null;
  return new Date(t.completion_time).getTime() - new Date(t.session_start).getTime();
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function isAdminRow(t: TeamAdminRecord): boolean {
  if (t.is_admin) return true;
  if ((t.team_id ?? "").toLowerCase().startsWith("admin")) return true;
  if (adminEmailSet.has((t.email ?? "").toLowerCase())) return true;
  return false;
}

const statusBadge: Record<Status, { bg: string; text: string; dot: string }> = {
  Standby:     { bg: "bg-zinc-800/60",    text: "text-zinc-400",    dot: "bg-zinc-500" },
  Active:      { bg: "bg-red-900/30",     text: "text-red-400",     dot: "bg-red-400" },
  Survived:    { bg: "bg-emerald-900/30", text: "text-emerald-400", dot: "bg-emerald-400" },
  Deactivated: { bg: "bg-amber-900/30",   text: "text-amber-400",   dot: "bg-amber-500" },
  Terminated:  { bg: "bg-red-950/50",     text: "text-red-600",     dot: "bg-red-600" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function AdminPage() {
  const router = useRouter();

  const [teams, setTeams] = useState<TeamAdminRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionLog[]>([]);
  const [teamIdInput, setTeamIdInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [broadcastInput, setBroadcastInput] = useState("");
  const [finalKeyInput, setFinalKeyInput] = useState("");
  const [currentFinalKey, setCurrentFinalKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tick, setTick] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [defaultDurationMin, setDefaultDurationMin] = useState(30);
  const [defaultMaxAttempts, setDefaultMaxAttempts] = useState(2);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [teamFinalKeyInputs, setTeamFinalKeyInputs] = useState<Record<string, string>>({});
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [docFiles, setDocFiles] = useState<Record<string, File>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, string>>({});

  const isConfigured = useMemo(() => Boolean(supabase), []);

  /* ---- toast helper ---- */
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (type === "success") haptics.success();
    else haptics.error();
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  /* ---- data loaders ---- */
  const loadTeams = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("teams")
      .select(TEAM_COLS)
      .order("team_id", { ascending: true });
    if (error) { showToast(`Failed to load teams: ${error.message}`, "error"); return; }
    const participants = ((data ?? []) as TeamAdminRecord[]).filter((t) => !isAdminRow(t));
    setTeams(participants);

    // Keep an input buffer per team for editing keys.
    setTeamFinalKeyInputs((prev) => {
      const next: Record<string, string> = {};
      for (const t of participants) {
        next[t.id] = prev[t.id] ?? (t.final_key ?? "");
      }
      return next;
    });
  }, [showToast]);

  const loadFinalKey = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("settings").select("final_key").eq("id", 1).maybeSingle();
    if (error) { showToast(`Failed to load final key: ${error.message}`, "error"); return; }
    setCurrentFinalKey(data?.final_key ?? "");
    setFinalKeyInput(data?.final_key ?? "");
  }, [showToast]);

  const loadSubmissions = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("submissions")
      .select("id, team_id, submitted_key, correct, created_at")
      .order("created_at", { ascending: false });
    if (error) { showToast(`Failed to load submissions: ${error.message}`, "error"); return; }
    setSubmissions((data ?? []) as SubmissionLog[]);
  }, [showToast]);

  /* ---- initial load ---- */
  useEffect(() => {
    if (!isConfigured) { showToast("System configuration error.", "error"); setIsLoading(false); return; }
    const role = localStorage.getItem("role");
    if (role !== "admin") { router.replace("/login"); return; }
    Promise.all([loadTeams(), loadFinalKey()]).then(() => setIsLoading(false));
  }, [isConfigured, router, loadTeams, loadFinalKey, showToast]);

  /* ---- realtime: teams table → reload on any change ---- */
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("admin-teams-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => loadTeams())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadTeams]);

  /* ---- realtime: submissions → reload logs if panel open ---- */
  const showLogsRef = useRef(showLogs);
  useEffect(() => { showLogsRef.current = showLogs; }, [showLogs]);

  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("admin-subs-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "submissions" },
        () => { if (showLogsRef.current) loadSubmissions(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadSubmissions]);

  /* ---- 1-second tick ---- */
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  /* ================================================================ */
  /*  ACTIONS                                                          */
  /* ================================================================ */

  const addTeam = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;
    haptics.tap();
    const email = emailInput.trim().toLowerCase();
    const teamId = teamIdInput.trim();
    if (!email || !teamId) { showToast("Team ID and email are required.", "error"); return; }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("teams").insert({ team_id: teamId, email });
      if (error) { showToast("Failed to add team: " + error.message, "error"); return; }
      setTeamIdInput(""); setEmailInput("");
      showToast("Team registered successfully.");
    } finally { setIsSubmitting(false); }
  };

  const removeTeam = async (t: TeamAdminRecord) => {
    if (!supabase || !confirm(`Remove team ${t.team_id}? This is permanent.`)) return;
    haptics.warning();
    const { error } = await supabase.from("teams").delete().eq("id", t.id);
    if (error) { showToast("Failed to remove team.", "error"); return; }
    showToast(`Team ${t.team_id} removed.`);
  };

  const setTeamActive = async (t: TeamAdminRecord, active: boolean) => {
    if (!supabase) return;
    haptics.selection();
    const { error } = await supabase
      .from("teams")
      .update({ active, terminated: active ? false : t.terminated })
      .eq("id", t.id);
    if (error) { showToast("Failed to update.", "error"); return; }
    showToast(active ? `Team ${t.team_id} activated.` : `Team ${t.team_id} set to Standby.`);
  };

  const startSession = async (t: TeamAdminRecord) => {
    if (!supabase) return;
    haptics.tap();
    const start = new Date();
    const end = new Date(start.getTime() + defaultDurationMin * 60 * 1000);
    const { error } = await supabase.from("teams").update({
      active: true, terminated: false,
      session_start: start.toISOString(),
      session_end: end.toISOString(),
      max_attempts: defaultMaxAttempts,
      attempts: 0,
    }).eq("id", t.id);
    if (error) { showToast("Failed to start session.", "error"); return; }
    showToast(`${defaultDurationMin}m session started for ${t.team_id} (${defaultMaxAttempts} attempts).`);
  };

  const stopSession = async (t: TeamAdminRecord) => {
    if (!supabase) return;
    haptics.warning();
    const { error } = await supabase.from("teams")
      .update({ session_end: new Date().toISOString() }).eq("id", t.id);
    if (error) { showToast("Failed to stop session.", "error"); return; }
    showToast(`Session stopped for ${t.team_id}.`);
  };

  const forceTerminate = async (t: TeamAdminRecord) => {
    if (!supabase) return;
    if (!confirm(`Terminate team ${t.team_id}? They will be logged out and blocked.`)) return;
    haptics.warning();
    const { error } = await supabase.from("teams").update({
      active: false, terminated: true, deactivated: false,
      session_end: t.session_end ?? new Date().toISOString(),
    }).eq("id", t.id);
    if (error) { showToast("Failed to terminate team.", "error"); return; }
    showToast(`Team ${t.team_id} terminated — logged out and locked.`);
  };

  const deactivateTeam = async (t: TeamAdminRecord) => {
    if (!supabase) return;
    haptics.warning();
    const { error } = await supabase.from("teams").update({
      active: false, deactivated: true, terminated: false,
      session_end: t.session_end ?? new Date().toISOString(),
    }).eq("id", t.id);
    if (error) { showToast("Failed to deactivate team.", "error"); return; }
    showToast(`Team ${t.team_id} deactivated — can still view results.`);
  };

  const assignDocuments = async () => {
    if (!supabase) return;
    haptics.tap();
    const entries = Array.from(selectedTeams).filter((id) => docFiles[id]);
    if (entries.length === 0) { showToast("Select teams and choose files to upload.", "error"); return; }
    setIsSubmitting(true);
    try {
      let success = 0;
      for (const id of entries) {
        const file = docFiles[id];
        const team = teams.find((t) => t.id === id);
        const safeName = (team?.team_id ?? id).replace(/[^a-zA-Z0-9_-]/g, "_");
        const ext = file.name.split(".").pop() ?? "bin";
        const storagePath = `${safeName}/${Date.now()}.${ext}`;

        setUploadProgress((p) => ({ ...p, [id]: "Uploading..." }));

        const { error: upErr } = await supabase.storage
          .from("team-documents")
          .upload(storagePath, file, { upsert: true });

        if (upErr) {
          setUploadProgress((p) => ({ ...p, [id]: "Failed" }));
          showToast(`Upload failed for ${team?.team_id}: ${upErr.message}`, "error");
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("team-documents")
          .getPublicUrl(storagePath);

        const publicUrl = urlData?.publicUrl ?? "";

        const { error: dbErr } = await supabase
          .from("teams")
          .update({ document_url: publicUrl })
          .eq("id", id);

        if (dbErr) {
          setUploadProgress((p) => ({ ...p, [id]: "DB error" }));
          showToast(`DB update failed for ${team?.team_id}`, "error");
          continue;
        }

        setUploadProgress((p) => ({ ...p, [id]: "Done" }));
        success++;
      }
      showToast(`Documents uploaded & assigned to ${success} team(s).`);
      setSelectedTeams(new Set());
      setDocFiles({});
      setTimeout(() => setUploadProgress({}), 3000);
    } finally { setIsSubmitting(false); }
  };

  const removeDocument = async (t: TeamAdminRecord) => {
    if (!supabase) return;
    if (!confirm(`Remove document from team ${t.team_id}?`)) return;
    haptics.warning();
    const { error } = await supabase.from("teams").update({ document_url: null }).eq("id", t.id);
    if (error) { showToast("Failed to remove document.", "error"); return; }
    showToast(`Document removed from ${t.team_id}.`);
  };

  const toggleTeamSelect = (id: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllTeams = () => {
    if (selectedTeams.size === teams.length) {
      setSelectedTeams(new Set());
    } else {
      setSelectedTeams(new Set(teams.map((t) => t.id)));
    }
  };

  const saveFinalKey = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;
    haptics.tap();
    const key = finalKeyInput.trim();
    if (!key) { showToast("Enter a key.", "error"); return; }
    const { data, error } = await supabase
      .from("settings")
      .upsert({ id: 1, final_key: key }, { onConflict: "id" })
      .select("final_key")
      .single();
    if (error) {
      showToast(`Failed to save final key: ${error.message}`, "error");
      return;
    }
    const saved = data?.final_key ?? key;
    setCurrentFinalKey(saved);
    setFinalKeyInput(saved);
    showToast("Final survival key saved.");
  };

  const saveTeamFinalKey = async (t: TeamAdminRecord) => {
    if (!supabase) return;
    haptics.tap();
    const raw = teamFinalKeyInputs[t.id] ?? "";
    const key = raw.trim();
    if (!key) {
      showToast(`Enter a key for ${t.team_id ?? "this team"}.`, "error");
      return;
    }
    const { error } = await supabase.from("teams").update({ final_key: key }).eq("id", t.id);
    if (error) {
      showToast(`Failed to save team key: ${error.message}`, "error");
      return;
    }
    showToast(`Final key saved for ${t.team_id ?? "team"}.`);
  };

  const clearSubmissionLogs = async () => {
    if (!supabase) return;
    if (!confirm("Clear ALL submission logs? This cannot be undone.")) return;

    haptics.warning();

    setIsClearingLogs(true);
    try {
      // Supabase requires a filter for deletes; this predicate matches all UUID rows.
      const { error } = await supabase
        .from("submissions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        showToast(`Failed to clear submissions: ${error.message}`, "error");
        return;
      }
      setSubmissions([]);
      showToast("Submission logs cleared.");
    } finally {
      setIsClearingLogs(false);
    }
  };

  const sendBroadcast = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;
    haptics.tap();
    const msg = broadcastInput.trim();
    if (!msg) { showToast("Enter a broadcast message.", "error"); return; }
    const { error } = await supabase.from("broadcast").insert({ message: msg });
    if (error) { showToast("Failed to send broadcast: " + error.message, "error"); return; }
    setBroadcastInput("");
    showToast("Broadcast transmitted to all participants.");
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  const inputClass =
    "rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-600 focus:ring-2 focus:ring-red-600/30 w-full";
  const btnRed =
    "rounded-xl border border-red-600 bg-red-600 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";
  const numInput =
    "rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/30 w-28 text-center tabular-nums";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ---- Toast stack (bottom-right) ---- */}
      <div
        className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl animate-toast-in
              ${t.type === "success"
                ? "border-emerald-700/80 bg-emerald-950 text-emerald-300"
                : "border-red-800/80 bg-red-950 text-red-300"
              }`}
            style={{ minWidth: "220px", maxWidth: "340px" }}
          >
            <span
              className={`h-2 w-2 rounded-full flex-shrink-0 ${
                t.type === "success" ? "bg-emerald-400" : "bg-red-500"
              }`}
            />
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-zinc-500 hover:text-white ml-1 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(24px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0)  scale(1);    }
        }
        .animate-toast-in { animation: toast-in 0.22s ease-out; }
      `}</style>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-10">
        {/* Header */}
        <section className="rounded-2xl border border-red-900/50 bg-zinc-950 p-5 shadow-lg shadow-red-950/20">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-500">
            Controlled Session Protocol
          </p>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">
            Control Room
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Manage teams · Control sessions · Assign documents · Broadcast commands ·{" "}
            <span className="text-emerald-600">Live updates enabled</span>
          </p>
        </section>

        {/* ---- Session Defaults ---- */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-red-500">
            Session Defaults
          </h2>
          <p className="mt-1 mb-4 text-xs text-zinc-500">
            Applied when you click &ldquo;Start&rdquo; on any team. Change before starting.
          </p>
          <div className="flex flex-wrap gap-6">
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Duration (minutes)
              </span>
              <input
                type="number"
                min={1}
                max={180}
                value={defaultDurationMin}
                onChange={(e) => setDefaultDurationMin(Math.max(1, Number(e.target.value)))}
                className={numInput}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Max Attempts
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={defaultMaxAttempts}
                onChange={(e) => setDefaultMaxAttempts(Math.max(1, Number(e.target.value)))}
                className={numInput}
              />
            </label>
          </div>
        </section>

        {/* ---- Add Team ---- */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-red-500">
            Register Team
          </h2>
          <form onSubmit={addTeam} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input type="text" value={teamIdInput} onChange={(e) => setTeamIdInput(e.target.value)}
              placeholder="Team ID" className={inputClass} />
            <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
              placeholder="team@email.com" className={inputClass} />
            <button type="submit" disabled={isSubmitting} className={btnRed}>
              {isSubmitting ? "Adding..." : "Add Team"}
            </button>
          </form>
        </section>

        {/* ---- Final Survival Key ---- */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-red-500">
            Final Survival Key
          </h2>
          {currentFinalKey && (
            <p className="mt-2 text-xs text-zinc-500">
              Current key: <span className="font-mono text-white">{currentFinalKey}</span>
            </p>
          )}
          <form onSubmit={saveFinalKey} className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input type="text" value={finalKeyInput} onChange={(e) => setFinalKeyInput(e.target.value)}
              placeholder="Set new key" className={inputClass} />
            <button type="submit" className={btnRed}>Save Key</button>
          </form>
        </section>

        {/* ---- Broadcast ---- */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-red-500">
            Broadcast Command
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Delivered instantly as a fullscreen overlay to all logged-in participants via realtime.
          </p>
          <form onSubmit={sendBroadcast} className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input type="text" value={broadcastInput} onChange={(e) => setBroadcastInput(e.target.value)}
              placeholder="Enter broadcast message" className={inputClass} />
            <button type="submit" className={btnRed}>Transmit</button>
          </form>
        </section>

        {/* ---- Document Assignment ---- */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-red-500">
            Assign Documents
          </h2>
          <p className="mt-1 mb-4 text-xs text-zinc-500">
            Select teams, choose a file for each, then click &ldquo;Upload & Assign&rdquo;. Files are uploaded to storage and linked to each team.
          </p>
          <div className="mb-3 flex items-center gap-3">
            <button type="button" onClick={selectAllTeams}
              className="text-[10px] font-bold uppercase tracking-wider text-red-400 underline underline-offset-4 hover:text-red-300">
              {selectedTeams.size === teams.length ? "Deselect All" : "Select All"}
            </button>
            <span className="text-[10px] text-zinc-600">{selectedTeams.size} selected</span>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-zinc-800 bg-black">
            {teams.map((t) => (
              <div key={t.id}
                className={`flex flex-wrap items-center gap-3 border-b border-zinc-800/60 px-3 py-3 ${selectedTeams.has(t.id) ? "bg-red-950/20" : ""}`}>
                <input type="checkbox" checked={selectedTeams.has(t.id)}
                  onChange={() => toggleTeamSelect(t.id)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 accent-red-600" />
                <span className="min-w-[80px] text-sm font-bold text-white">{t.team_id ?? "—"}</span>

                {/* File picker */}
                <label className="flex-1 min-w-[180px]">
                  <input type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.xlsx,.pptx,.zip"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setDocFiles((p) => ({ ...p, [t.id]: f }));
                        if (!selectedTeams.has(t.id)) toggleTeamSelect(t.id);
                      }
                    }}
                    className="block w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border file:border-zinc-700 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:text-zinc-300 file:cursor-pointer hover:file:bg-zinc-800" />
                  {docFiles[t.id] && (
                    <span className="mt-1 block text-[10px] text-zinc-500 truncate">
                      Selected: {docFiles[t.id].name} ({(docFiles[t.id].size / 1024).toFixed(0)} KB)
                    </span>
                  )}
                </label>

                {/* Status indicators */}
                <div className="flex items-center gap-2 min-w-[70px] justify-end">
                  {uploadProgress[t.id] && (
                    <span className={`text-[9px] font-bold uppercase ${
                      uploadProgress[t.id] === "Done" ? "text-emerald-500" :
                      uploadProgress[t.id] === "Failed" || uploadProgress[t.id] === "DB error" ? "text-red-500" :
                      "text-amber-400 animate-pulse"
                    }`}>
                      {uploadProgress[t.id]}
                    </span>
                  )}
                  {t.document_url && !uploadProgress[t.id] && (
                    <div className="flex items-center gap-1.5">
                      <a href={t.document_url} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-bold uppercase text-emerald-400 underline underline-offset-2 hover:text-emerald-300">
                        View
                      </a>
                      <button type="button" onClick={() => removeDocument(t)}
                        className="text-[9px] font-bold uppercase text-red-500 hover:text-red-400">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {teams.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-zinc-600">No teams registered.</p>
            )}
          </div>
          <button type="button" onClick={assignDocuments}
            disabled={isSubmitting || Object.keys(docFiles).filter((id) => selectedTeams.has(id)).length === 0}
            className={`${btnRed} mt-3 w-full sm:w-auto`}>
            {isSubmitting ? "Uploading..." : `Upload & Assign (${Object.keys(docFiles).filter((id) => selectedTeams.has(id)).length})`}
          </button>
        </section>

        {/* ---- Leaderboard (Admin View) ---- */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-red-500">
              Leaderboard
            </h2>
            <button type="button"
              onClick={() => setShowLeaderboard((v) => !v)}
              className="text-xs font-bold uppercase tracking-wider text-red-400 underline underline-offset-4 hover:text-red-300">
              {showLeaderboard ? "Hide" : "Show"}
            </button>
          </div>
          {showLeaderboard && (() => {
            const survived = teams
              .filter((t) => t.completed)
              .map((t) => ({ ...t, duration: computeDuration(t) }))
              .sort((a, b) => (a.duration ?? Infinity) - (b.duration ?? Infinity));
            const rest = teams
              .filter((t) => !t.completed)
              .sort((a, b) => {
                const sa = deriveStatus(a);
                const sb = deriveStatus(b);
                const p: Record<Status, number> = { Survived: 0, Active: 1, Standby: 2, Deactivated: 3, Terminated: 4 };
                return p[sa] - p[sb];
              });
            const sorted = [...survived, ...rest];
            return (
              <div className="mt-4 max-h-80 overflow-auto">
                <table className="w-full min-w-[500px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="px-2 py-2 font-medium">Rank</th>
                      <th className="px-2 py-2 font-medium">Team</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((t, i) => {
                      const status = deriveStatus(t);
                      const badge = statusBadge[status];
                      const dur = computeDuration(t);
                      return (
                        <tr key={t.id} className="border-b border-zinc-800/60">
                          <td className="px-2 py-2 font-mono text-zinc-400">{String(i + 1).padStart(2, "0")}</td>
                          <td className="px-2 py-2 font-bold text-white">{t.team_id ?? "—"}</td>
                          <td className="px-2 py-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge.bg} ${badge.text}`}>
                              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${badge.dot}`} />
                              {status}
                            </span>
                          </td>
                          <td className={`px-2 py-2 font-mono ${t.completed ? "text-emerald-400" : "text-zinc-600"}`}>
                            {dur !== null ? formatDuration(dur) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {sorted.length === 0 && (
                      <tr><td colSpan={4} className="px-2 py-4 text-center text-zinc-600">No teams yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </section>

        {/* ---- Submission Logs ---- */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-red-500">
              Submission Logs
            </h2>
            <div className="flex items-center gap-3">
              {showLogs && (
                <button
                  type="button"
                  onClick={clearSubmissionLogs}
                  disabled={isClearingLogs}
                  className="text-xs font-bold uppercase tracking-wider text-zinc-400 underline underline-offset-4 hover:text-white disabled:opacity-50"
                >
                  {isClearingLogs ? "Clearing…" : "Clear Logs"}
                </button>
              )}
              <button
                type="button"
                onClick={() => { const next = !showLogs; setShowLogs(next); if (next) loadSubmissions(); }}
                className="text-xs font-bold uppercase tracking-wider text-red-400 underline underline-offset-4 hover:text-red-300"
              >
                {showLogs ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {showLogs && (
            <div className="mt-4 max-h-72 overflow-auto">
              <table className="w-full min-w-[500px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="px-2 py-2 font-medium">Team</th>
                    <th className="px-2 py-2 font-medium">Key</th>
                    <th className="px-2 py-2 font-medium">Correct</th>
                    <th className="px-2 py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id} className="border-b border-zinc-800/60">
                      <td className="px-2 py-2 text-white">{s.team_id ?? "—"}</td>
                      <td className="px-2 py-2 font-mono text-zinc-400">{s.submitted_key ?? "—"}</td>
                      <td className={`px-2 py-2 font-bold ${s.correct ? "text-emerald-400" : "text-red-500"}`}>
                        {s.correct ? "Yes" : "No"}
                      </td>
                      <td className="px-2 py-2 text-zinc-500">
                        {s.created_at ? new Date(s.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr><td colSpan={4} className="px-2 py-4 text-center text-zinc-600">No submissions yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---- Teams Table ---- */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-red-500">
              Teams{" "}
              <span className="text-zinc-600 font-normal normal-case tracking-normal text-xs">
                ({teams.length})
              </span>
            </h2>
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>

          {isLoading ? (
            <p className="text-sm text-zinc-500">Loading teams...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Doc</th>
                    <th className="px-3 py-2">Key</th>
                    <th className="px-3 py-2">Attempts</th>
                    <th className="px-3 py-2">Countdown</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => {
                    const status = deriveStatus(t);
                    const secs = getSecondsLeft(t.session_end);
                    const isWarning = secs > 0 && secs <= 300;
                    const isEnded = Boolean(t.session_end) && secs <= 0;
                    const maxAtt = t.max_attempts ?? 2;
                    const badge = statusBadge[status];

                    return (
                      <tr key={t.id} className="border-b border-zinc-800/60 align-top">
                        <td className="px-3 py-3 font-bold text-white">{t.team_id ?? "—"}</td>
                        <td className="px-3 py-3 text-zinc-400">{t.email ?? "—"}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${badge.bg} ${badge.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${badge.dot} ${status === "Active" ? "animate-pulse" : ""}`} />
                            {status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {t.document_url ? (
                            <div className="flex items-center gap-1.5">
                              <a href={t.document_url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] font-bold uppercase text-emerald-400 underline underline-offset-2 hover:text-emerald-300">
                                View
                              </a>
                              <button type="button" onClick={() => removeDocument(t)}
                                className="text-[10px] font-bold uppercase text-red-500 hover:text-red-400">
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-zinc-600">None</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              value={teamFinalKeyInputs[t.id] ?? ""}
                              onChange={(e) => setTeamFinalKeyInputs((p) => ({ ...p, [t.id]: e.target.value }))}
                              placeholder="Per-team key"
                              className="w-40 rounded-lg border border-zinc-800 bg-black px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-red-600 focus:ring-2 focus:ring-red-600/30"
                            />
                            <button
                              type="button"
                              onClick={() => saveTeamFinalKey(t)}
                              className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-1.5 text-[10px] font-bold uppercase text-zinc-200 hover:bg-zinc-800/60"
                            >
                              Save
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-zinc-300 tabular-nums">{t.attempts ?? 0} / {maxAtt}</td>
                        <td className={`px-3 py-3 font-mono font-bold tabular-nums ${isWarning ? "animate-pulse text-orange-400" : isEnded && status === "Active" ? "text-red-600" : isEnded ? "text-zinc-600" : "text-white"}`}>
                          {void tick}{isEnded ? "00:00:00" : formatCountdown(t.session_end)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {!t.active ? (
                              <button type="button" onClick={() => setTeamActive(t, true)}
                                className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-300 hover:bg-emerald-800/50">
                                Activate
                              </button>
                            ) : (
                              <button type="button" onClick={() => setTeamActive(t, false)}
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[10px] font-bold uppercase text-zinc-300 hover:bg-zinc-700">
                                Standby
                              </button>
                            )}
                            <button type="button" onClick={() => startSession(t)}
                              className="rounded-lg border border-red-700 bg-red-900/40 px-2.5 py-1 text-[10px] font-bold uppercase text-red-300 hover:bg-red-800/50">
                              Start {defaultDurationMin}m
                            </button>
                            {t.active && t.session_end && secs > 0 && (
                              <button type="button" onClick={() => stopSession(t)}
                                className="rounded-lg border border-amber-700 bg-amber-900/40 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-300 hover:bg-amber-800/50">
                                Stop
                              </button>
                            )}
                            {status !== "Survived" && status !== "Terminated" && (
                              <button type="button" onClick={() => deactivateTeam(t)}
                                className="rounded-lg border border-amber-700 bg-amber-900/40 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-300 hover:bg-amber-800/50">
                                Deactivate
                              </button>
                            )}
                            {status !== "Survived" && status !== "Terminated" && (
                              <button type="button" onClick={() => forceTerminate(t)}
                                className="rounded-lg border border-red-800 bg-red-950/60 px-2.5 py-1 text-[10px] font-bold uppercase text-red-500 hover:bg-red-900/60">
                                Terminate
                              </button>
                            )}
                            <button type="button" onClick={() => removeTeam(t)}
                              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold uppercase text-zinc-500 hover:bg-zinc-800 hover:text-red-400">
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {teams.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-zinc-600">No participant teams registered.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
