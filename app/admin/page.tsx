"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type TeamAdminRecord = {
  id: string;
  team_id: string | null;
  email: string | null;
  active: boolean | null;
  terminated: boolean | null;
  session_start: string | null;
  session_end: string | null;
  attempts: number | null;
  completed: boolean | null;
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
  "id, team_id, email, active, terminated, session_start, session_end, attempts, completed, max_attempts, is_admin";

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

type Status = "Standby" | "Active" | "Survived" | "Terminated";

function deriveStatus(t: TeamAdminRecord): Status {
  if (t.completed) return "Survived";
  if (t.terminated) return "Terminated";
  if (!t.active) return "Standby";
  if (t.session_end && new Date(t.session_end).getTime() <= Date.now()) return "Terminated";
  return "Active";
}

function isAdminRow(t: TeamAdminRecord): boolean {
  if (t.is_admin) return true;
  if ((t.team_id ?? "").toLowerCase().startsWith("admin")) return true;
  if (adminEmailSet.has((t.email ?? "").toLowerCase())) return true;
  return false;
}

const statusBadge: Record<Status, { bg: string; text: string; dot: string }> = {
  Standby:    { bg: "bg-zinc-800/60",    text: "text-zinc-400",    dot: "bg-zinc-500" },
  Active:     { bg: "bg-red-900/30",     text: "text-red-400",     dot: "bg-red-400" },
  Survived:   { bg: "bg-emerald-900/30", text: "text-emerald-400", dot: "bg-emerald-400" },
  Terminated: { bg: "bg-red-950/50",     text: "text-red-600",     dot: "bg-red-600" },
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [defaultDurationMin, setDefaultDurationMin] = useState(30);
  const [defaultMaxAttempts, setDefaultMaxAttempts] = useState(2);

  const isConfigured = useMemo(() => Boolean(supabase), []);

  /* ---- toast helper ---- */
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
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
    const { error } = await supabase.from("teams").delete().eq("id", t.id);
    if (error) { showToast("Failed to remove team.", "error"); return; }
    showToast(`Team ${t.team_id} removed.`);
  };

  const setTeamActive = async (t: TeamAdminRecord, active: boolean) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("teams")
      .update({ active, terminated: active ? false : t.terminated })
      .eq("id", t.id);
    if (error) { showToast("Failed to update.", "error"); return; }
    showToast(active ? `Team ${t.team_id} activated.` : `Team ${t.team_id} set to Standby.`);
  };

  const startSession = async (t: TeamAdminRecord) => {
    if (!supabase) return;
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
    const { error } = await supabase.from("teams")
      .update({ session_end: new Date().toISOString() }).eq("id", t.id);
    if (error) { showToast("Failed to stop session.", "error"); return; }
    showToast(`Session stopped for ${t.team_id}.`);
  };

  const forceTerminate = async (t: TeamAdminRecord) => {
    if (!supabase) return;
    const { error } = await supabase.from("teams").update({
      active: false, terminated: true,
      session_end: t.session_end ?? new Date().toISOString(),
    }).eq("id", t.id);
    if (error) { showToast("Failed to terminate team.", "error"); return; }
    showToast(`Team ${t.team_id} terminated.`);
  };

  const saveFinalKey = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;
    const key = finalKeyInput.trim();
    if (!key) { showToast("Enter a key.", "error"); return; }
    const { error } = await supabase.from("settings").update({ final_key: key }).eq("id", 1);
    if (error) { showToast("Failed to update final key.", "error"); return; }
    setCurrentFinalKey(key);
    showToast("Final survival key updated.");
  };

  const sendBroadcast = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;
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
            Manage teams · Control sessions · Broadcast commands ·{" "}
            <span className="text-emerald-600">Live updates enabled</span>
          </p>
          <Link
            href="/leaderboard"
            className="mt-3 inline-block text-xs font-bold uppercase tracking-wider text-red-400 underline underline-offset-4 hover:text-red-300"
          >
            View Leaderboard →
          </Link>
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

        {/* ---- Submission Logs ---- */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-red-500">
              Submission Logs
            </h2>
            <button
              type="button"
              onClick={() => { const next = !showLogs; setShowLogs(next); if (next) loadSubmissions(); }}
              className="text-xs font-bold uppercase tracking-wider text-red-400 underline underline-offset-4 hover:text-red-300"
            >
              {showLogs ? "Hide" : "Show"}
            </button>
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
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-600">No participant teams registered.</td></tr>
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
