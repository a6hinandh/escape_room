"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type TeamRecord = {
  id: string;
  team_id: string | null;
  email: string | null;
  active: boolean | null;
  terminated: boolean | null;
  deactivated: boolean | null;
  document_url: string | null;
  session_start: string | null;
  session_end: string | null;
  attempts: number | null;
  completed: boolean | null;
  completion_time: string | null;
  max_attempts: number | null;
};

/* ------------------------------------------------------------------ */
/*  Supabase client                                                    */
/* ------------------------------------------------------------------ */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const TEAM_COLS =
  "id, team_id, email, active, terminated, deactivated, document_url, session_start, session_end, attempts, completed, completion_time, max_attempts";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function formatCountdown(sessionEnd: string | null): string {
  if (!sessionEnd) return "--:--:--";
  const diff = Math.max(0, new Date(sessionEnd).getTime() - Date.now());
  if (diff <= 0) return "00:00:00";
  const s = Math.floor(diff / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function getSecondsLeft(sessionEnd: string | null): number {
  if (!sessionEnd) return 0;
  return Math.max(0, Math.floor((new Date(sessionEnd).getTime() - Date.now()) / 1000));
}

type Status = "Standby" | "Active" | "Survived" | "Deactivated" | "Terminated";

function deriveStatus(t: TeamRecord): Status {
  if (t.completed) return "Survived";
  if (t.terminated) return "Terminated";
  if (t.deactivated) return "Deactivated";
  if (!t.active) return "Standby";
  if (t.session_end && new Date(t.session_end).getTime() <= Date.now()) return "Deactivated";
  return "Active";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function DashboardPage() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [finalKeyInput, setFinalKeyInput] = useState("");
  const [finalKey, setFinalKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState("--:--:--");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [popupMessage, setPopupMessage] = useState("");

  const isConfigured = useMemo(() => Boolean(supabase), []);

  /* ---------- initial load ---------- */
  useEffect(() => {
    const load = async () => {
      if (!isConfigured || !supabase) {
        setErrorMessage("System configuration error.");
        setIsLoading(false);
        return;
      }

      const role = localStorage.getItem("role");
      if (role === "admin") { router.replace("/admin"); return; }

      const storedEmail = localStorage.getItem("teamEmail");
      const storedTeamId = localStorage.getItem("teamId");
      if (!storedEmail && !storedTeamId) { router.replace("/login"); return; }

      const teamLookup = storedEmail
        ? supabase.from("teams").select(TEAM_COLS).ilike("email", storedEmail).maybeSingle()
        : supabase.from("teams").select(TEAM_COLS).eq("team_id", storedTeamId ?? "").maybeSingle();

      const [{ data: td, error: te }, { data: sd }] = await Promise.all([
        teamLookup,
        supabase.from("settings").select("final_key").eq("id", 1).maybeSingle(),
      ]);

      if (te || !td) {
        setErrorMessage(
          te?.message
            ? `Identity verification failed: ${te.message}`
            : "Identity verification failed. Log in again."
        );
        setIsLoading(false);
        return;
      }

      setTeam(td as TeamRecord);
      setFinalKey(sd?.final_key ?? null);
      setTimeLeft(formatCountdown(td.session_end));
      setIsLoading(false);
    };
    load();
  }, [isConfigured, router]);

  /* ---------- realtime: own team row → react instantly to admin changes ---------- */
  useEffect(() => {
    if (!supabase || !team?.id) return;
    const ch = supabase
      .channel(`team-row-${team.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "teams", filter: `id=eq.${team.id}` },
        (payload) => { setTeam(payload.new as TeamRecord); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id]);

  /* ---------- realtime broadcast → fullscreen overlay ---------- */
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("broadcast-participant")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "broadcast" }, (payload) => {
        const msg = (payload.new as { message?: string }).message;
        // Show to all logged-in participants regardless of active state
        if (msg) setPopupMessage(msg);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  /* ---------- countdown tick (stops automatically when session ends) ---------- */
  useEffect(() => {
    if (!team?.session_end) return;
    // Immediately set so UI is correct on mount
    setTimeLeft(formatCountdown(team.session_end));
    if (getSecondsLeft(team.session_end) <= 0) return; // already over, no interval needed
    const timer = setInterval(() => {
      const sLeft = getSecondsLeft(team.session_end);
      setTimeLeft(formatCountdown(team.session_end));
      if (sLeft <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [team?.session_end]);

  /* ---------- derived state ---------- */
  const status: Status = team ? deriveStatus(team) : "Standby";
  const MAX_ATTEMPTS = team?.max_attempts ?? 2;
  const attemptsUsed = team?.attempts ?? 0;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsUsed);
  const isLocked = attemptsUsed >= MAX_ATTEMPTS;
  const secondsLeft = getSecondsLeft(team?.session_end ?? null);
  const isSessionOver = Boolean(team?.session_end) && secondsLeft <= 0;
  const isWarning = secondsLeft > 0 && secondsLeft <= 300;
  const canSubmit = status === "Active" && !isLocked && !isSubmitting;

  /* If terminated by admin, force logout */
  useEffect(() => {
    if (status === "Terminated") {
      localStorage.removeItem("teamEmail");
      localStorage.removeItem("teamId");
      localStorage.removeItem("role");
      router.replace("/login");
    }
  }, [status, router]);

  /* ---------- submit final key ---------- */
  const submitFinalKey = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage("");
    setMessage("");
    if (!team || !supabase) return;

    if (isLocked) { setErrorMessage("ACCESS LOCKED"); return; }
    if (status !== "Active") { setErrorMessage("SESSION TERMINATED — Submission disabled."); return; }

    const key = finalKeyInput.trim();
    if (!key) { setErrorMessage("Enter the final survival key."); return; }

    setIsSubmitting(true);
    try {
      const correct = Boolean(finalKey && key.toUpperCase() === finalKey.trim().toUpperCase());

      const { error: subErr } = await supabase.from("submissions").insert({
        team_id: team.team_id, submitted_key: key, correct,
      });
      if (subErr) { setErrorMessage("Submission failed. Try again."); return; }

      const next = attemptsUsed + 1;
      const { data: updated, error: upErr } = await supabase
        .from("teams")
        .update({
          attempts: next,
          completed: correct ? true : team.completed,
          completion_time: correct ? new Date().toISOString() : undefined,
        })
        .eq("id", team.id)
        .select(TEAM_COLS)
        .maybeSingle();

      if (upErr || !updated) { setErrorMessage("Submission recorded but status update failed."); return; }
      setTeam(updated as TeamRecord);
      setFinalKeyInput("");

      if (correct) {
        setMessage("SURVIVED");
      } else if (next >= MAX_ATTEMPTS) {
        setErrorMessage("ACCESS LOCKED");
      } else {
        setErrorMessage("INVALID KEY — TRY AGAIN");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------- loading state ---------- */
  if (isLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#050505",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "16px",
      }}>
        <div style={{
          width: "40px", height: "40px",
          borderRadius: "50%",
          border: "2px solid rgba(255,45,120,0.15)",
          borderTopColor: "#ff2d78",
          animation: "geo-rotate 0.8s linear infinite",
        }} />
        <p style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "11px",
          color: "#333",
          letterSpacing: "0.25em",
          textTransform: "uppercase",
        }}>
          Initializing session...
        </p>
      </div>
    );
  }

  /* ---------- STANDBY screen ---------- */
  if (status === "Standby") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#050505",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div aria-hidden="true" style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "500px", height: "500px",
          borderRadius: "50%",
          border: "1px solid rgba(255,45,120,0.06)",
          animation: "geo-rotate 30s linear infinite",
          pointerEvents: "none",
        }} />

        <div className="animate-pulse-pink" style={{
          width: "80px", height: "80px",
          borderRadius: "50%",
          border: "2px solid rgba(255,45,120,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "28px",
        }}>
          <div style={{
            width: "12px", height: "12px",
            borderRadius: "50%",
            background: "#ff2d78",
            boxShadow: "0 0 20px #ff2d78",
          }} />
        </div>

        <p style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "10px",
          color: "#ff2d78",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          marginBottom: "12px",
        }}>
          The Survival Room
        </p>

        <h1 style={{
          fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
          fontSize: "clamp(3rem, 8vw, 5rem)",
          letterSpacing: "0.08em",
          marginBottom: "8px",
        }}>
          STANDBY
        </h1>

        <p style={{
          color: "#444",
          fontSize: "13px",
          letterSpacing: "0.1em",
          marginBottom: "32px",
        }}>
          Await Controller Authorization
        </p>

        <div style={{
          display: "flex",
          gap: "16px",
          alignItems: "center",
          color: "#333",
        }}>
          <span className="sg-circle" />
          <span className="sg-triangle" />
          <span className="sg-square" />
        </div>

        <p style={{
          position: "absolute",
          bottom: "24px",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "10px",
          color: "#222",
          letterSpacing: "0.2em",
        }}>
          TEAM {team?.team_id ?? "—"}
        </p>
      </div>
    );
  }

  /* ---------- POST-SESSION SCREEN (Survived / Deactivated / Session Over) ---------- */
  if (status === "Survived" || status === "Deactivated" || (status !== "Active" && isSessionOver) || isLocked) {
    const survived = status === "Survived";
    return (
      <div style={{
        minHeight: "100vh",
        background: "#050505",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative rotating circles */}
        <div aria-hidden="true" style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px", height: "600px",
          borderRadius: "50%",
          border: `1px solid ${survived ? "rgba(0,196,160,0.08)" : "rgba(255,45,120,0.06)"}`,
          animation: "geo-rotate 40s linear infinite",
          pointerEvents: "none",
        }} />
        <div aria-hidden="true" style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%) rotate(45deg)",
          width: "420px", height: "420px",
          border: `1px solid ${survived ? "rgba(0,196,160,0.05)" : "rgba(255,45,120,0.04)"}`,
          animation: "geo-rotate 25s linear infinite reverse",
          pointerEvents: "none",
        }} />
        <div aria-hidden="true" style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "240px", height: "240px",
          borderRadius: "50%",
          border: `1px solid ${survived ? "rgba(0,196,160,0.1)" : "rgba(255,45,120,0.07)"}`,
          animation: "geo-rotate 15s linear infinite",
          pointerEvents: "none",
        }} />

        {/* Giant geometric symbol cluster */}
        <div className="animate-scale-in" style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "24px",
          marginBottom: "32px",
          zIndex: 1,
        }}>
          {/* Large circle with inner shapes */}
          <div style={{
            width: "120px", height: "120px",
            borderRadius: "50%",
            border: `3px solid ${survived ? "rgba(0,196,160,0.6)" : "rgba(255,45,120,0.5)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
            boxShadow: survived
              ? "0 0 60px rgba(0,196,160,0.2), inset 0 0 30px rgba(0,196,160,0.05)"
              : "0 0 60px rgba(255,45,120,0.2), inset 0 0 30px rgba(255,45,120,0.05)",
            animation: survived ? "" : "pulse-pink 3s ease-in-out infinite",
          }}>
            {survived ? (
              <div style={{
                width: "0", height: "0",
                borderLeft: "22px solid transparent",
                borderRight: "22px solid transparent",
                borderBottom: "38px solid rgba(0,196,160,0.8)",
              }} />
            ) : (
              <div style={{
                width: "36px", height: "36px",
                border: "3px solid rgba(255,45,120,0.7)",
              }} />
            )}
          </div>

          {/* Three symbols row */}
          <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
            <span style={{
              width: "20px", height: "20px",
              borderRadius: "50%",
              border: `2px solid ${survived ? "rgba(0,196,160,0.5)" : "rgba(255,45,120,0.4)"}`,
              display: "inline-block",
            }} />
            <span style={{
              width: "0", height: "0",
              borderLeft: "12px solid transparent",
              borderRight: "12px solid transparent",
              borderBottom: `20px solid ${survived ? "rgba(0,196,160,0.5)" : "rgba(255,45,120,0.4)"}`,
              display: "inline-block",
            }} />
            <span style={{
              width: "18px", height: "18px",
              border: `2px solid ${survived ? "rgba(0,196,160,0.5)" : "rgba(255,45,120,0.4)"}`,
              display: "inline-block",
            }} />
          </div>
        </div>

        {/* Protocol label */}
        <p className="animate-slide-up" style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "10px",
          color: survived ? "var(--teal, #00c4a0)" : "#ff2d78",
          letterSpacing: "0.35em",
          textTransform: "uppercase",
          marginBottom: "12px",
          zIndex: 1,
        }}>
          {survived ? "Survival Confirmed" : "Session Complete"}
        </p>

        {/* Big heading */}
        <h1 className="animate-slide-up" style={{
          fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
          fontSize: "clamp(3.5rem, 10vw, 7rem)",
          letterSpacing: "0.06em",
          lineHeight: 0.95,
          color: survived ? "var(--teal, #00c4a0)" : "#fff",
          textShadow: survived
            ? "0 0 40px rgba(0,196,160,0.4)"
            : "0 0 40px rgba(255,45,120,0.2)",
          marginBottom: "8px",
          zIndex: 1,
        }}>
          {survived ? "SURVIVED" : "ELIMINATED"}
        </h1>

        {/* Team ID */}
        <p className="animate-slide-up-delay-1" style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "12px",
          color: "#555",
          letterSpacing: "0.2em",
          marginBottom: "36px",
          zIndex: 1,
        }}>
          TEAM {team?.team_id ?? "—"}
        </p>

        {/* View Leaderboard button */}
        <Link
          href="/leaderboard"
          className="animate-slide-up-delay-2 btn-primary"
          style={{
            fontFamily: "var(--font-mono, monospace)",
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "13px",
            zIndex: 1,
            background: survived ? "var(--teal, #00c4a0)" : undefined,
          }}
        >
          <span style={{
            width: "10px", height: "10px",
            borderRadius: "50%",
            border: "1.5px solid currentColor",
            display: "inline-block",
          }} />
          View Leaderboard
        </Link>

        {/* Decorative line */}
        <div className="animate-slide-up-delay-3" style={{
          marginTop: "40px",
          width: "60px",
          height: "1px",
          background: survived
            ? "linear-gradient(90deg, transparent, rgba(0,196,160,0.4), transparent)"
            : "linear-gradient(90deg, transparent, rgba(255,45,120,0.3), transparent)",
          zIndex: 1,
        }} />

        <p className="animate-slide-up-delay-3" style={{
          marginTop: "12px",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "9px",
          color: "#222",
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          zIndex: 1,
        }}>
          The Survival Room — Protocol Complete
        </p>

        {/* Broadcast overlay still works */}
        {popupMessage && (
          <div className="animate-overlay-in" style={{
            position: "fixed", inset: 0, zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.92)", backdropFilter: "blur(12px)", padding: "24px",
          }}>
            <div className="animate-modal-in card" style={{
              maxWidth: "440px", width: "100%", padding: "32px 28px", textAlign: "center",
              border: "1px solid rgba(255,45,120,0.5)",
              boxShadow: "0 0 80px rgba(255,45,120,0.15), 0 40px 80px rgba(0,0,0,0.8)",
            }}>
              <p style={{
                fontFamily: "var(--font-mono, monospace)", fontSize: "9px", color: "#ff2d78",
                letterSpacing: "0.35em", textTransform: "uppercase", marginBottom: "14px",
              }}>Live Command</p>
              <h2 style={{
                fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
                fontSize: "clamp(1.8rem, 5vw, 2.8rem)", letterSpacing: "0.05em",
                color: "#fff", lineHeight: 1.1, marginBottom: "24px",
              }}>{popupMessage}</h2>
              <button type="button" onClick={() => setPopupMessage("")}
                className="btn-primary" style={{ fontFamily: "var(--font-mono, monospace)", width: "100%" }}>
                Acknowledge
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---------- TERMINATED screen (will redirect, but show briefly) ---------- */
  if (status === "Terminated") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#050505",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "24px",
      }}>
        <p style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "11px",
          color: "#ff4444",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}>
          SESSION TERMINATED — REDIRECTING...
        </p>
      </div>
    );
  }

  /* ---------- Status colors ---------- */
  const statusConfig = {
    Survived: { color: "var(--teal, #00c4a0)", label: "SURVIVED" },
    Terminated: { color: "#ff4444", label: "TERMINATED" },
    Deactivated: { color: "#f59e0b", label: "DEACTIVATED" },
    Active: { color: "var(--pink, #ff2d78)", label: "ACTIVE" },
    Standby: { color: "#444", label: "STANDBY" },
  }[status];

  /* ---------- main dashboard ---------- */
  return (
    <div style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
      <main style={{
        maxWidth: "680px",
        margin: "0 auto",
        padding: "clamp(20px, 4vw, 40px) 16px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}>

        {/* Header */}
        <header className="animate-slide-up card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span className="sg-circle text-pink" />
            <span className="sg-triangle text-pink" />
            <span className="sg-square text-pink" />
          </div>
          <p style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "9px",
            color: "#444",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            marginBottom: "4px",
          }}>
            Controlled Session Protocol
          </p>
          <h1 style={{
            fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
            fontSize: "1.8rem",
            letterSpacing: "0.05em",
          }}>
            The Survival Room
          </h1>
        </header>

        {/* Stats row */}
        <section
          className="animate-slide-up-delay-1"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}
        >
          {/* Team ID */}
          <div className="card" style={{ padding: "16px 14px" }}>
            <p style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "9px",
              color: "#444",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}>Team ID</p>
            <p style={{
              fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
              fontSize: "1.5rem",
              letterSpacing: "0.05em",
            }}>
              {team?.team_id ?? "—"}
            </p>
          </div>

          {/* Status */}
          <div className="card" style={{ padding: "16px 14px" }}>
            <p style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "9px",
              color: "#444",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}>Status</p>
            <p style={{
              fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
              fontSize: "1.5rem",
              letterSpacing: "0.05em",
              color: statusConfig.color,
            }}>
              {statusConfig.label}
            </p>
          </div>

          {/* Attempts */}
          <div className="card" style={{ padding: "16px 14px" }}>
            <p style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "9px",
              color: "#444",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}>Attempts</p>
            <p style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "1.4rem",
              color: attemptsLeft === 0 ? "#ff4444" : "#fff",
            }}>
              {attemptsLeft} <span style={{ color: "#333", fontSize: "0.9rem" }}>/ {MAX_ATTEMPTS}</span>
            </p>
          </div>
        </section>

        {/* Countdown */}
        <section
          className={`animate-slide-up-delay-2 card ${isWarning || isSessionOver ? "animate-border-flash" : ""}`}
          style={{
            padding: "28px 24px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div className="scan-line" style={{ position: "absolute", inset: 0, borderRadius: "inherit" }} />

          <p style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "9px",
            color: "#444",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            marginBottom: "12px",
          }}>
            Survival Window
          </p>

          <div
            className={`countdown-display ${
              isWarning || isSessionOver
                ? "animate-countdown-warning"
                : status === "Active"
                ? "animate-glow-pulse"
                : ""
            }`}
            style={{
              fontFamily: "var(--font-mono, 'Share Tech Mono', monospace)",
              fontSize: "clamp(3rem, 8vw, 5rem)",
              letterSpacing: "0.08em",
              lineHeight: 1,
              color: isSessionOver ? "#ff4444" : isWarning ? "#ff2d78" : "#fff",
            }}
          >
            {timeLeft}
          </div>

          {isWarning && !isSessionOver && (
            <p
              className="animate-pulse-text"
              style={{
                marginTop: "12px",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "10px",
                color: "#ff2d78",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              ▲ FINAL PHASE — SURVIVAL WINDOW CLOSING
            </p>
          )}

          {isSessionOver && (
            <p style={{
              marginTop: "12px",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "10px",
              color: "#ff4444",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}>
              ■ SESSION TERMINATED
            </p>
          )}
        </section>

        {/* Final Key Submission */}
        <section className="animate-slide-up-delay-3 card" style={{ padding: "24px" }}>
          <div className="section-label" style={{ marginBottom: "16px" }}>
            <span className="sg-triangle text-pink" />
            Final Survival Key
          </div>

          {isLocked ? (
            <div style={{
              background: "rgba(255,60,60,0.04)",
              border: "1px solid rgba(255,60,60,0.3)",
              borderRadius: "10px",
              padding: "20px",
              textAlign: "center",
            }}>
              <p style={{
                fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
                fontSize: "1.6rem",
                color: "#ff4444",
                letterSpacing: "0.1em",
                marginBottom: "4px",
              }}>
                ACCESS LOCKED
              </p>
              <p style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "10px",
                color: "#553",
                letterSpacing: "0.15em",
              }}>
                ALL ATTEMPTS EXHAUSTED
              </p>
            </div>
          ) : (
            <form onSubmit={submitFinalKey} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input
                type="text"
                value={finalKeyInput}
                onChange={(e) => setFinalKeyInput(e.target.value)}
                placeholder="Enter final survival key"
                disabled={!canSubmit}
                className="input-sg"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className="btn-primary"
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              >
                {isSubmitting ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
                    <span style={{
                      width: "10px", height: "10px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      display: "inline-block",
                      animation: "geo-rotate 0.7s linear infinite",
                    }} />
                    Submitting...
                  </span>
                ) : "Submit Key"}
              </button>
            </form>
          )}

          {/* Success message */}
          {message && (
            <div
              className="animate-slide-up"
              style={{
                marginTop: "14px",
                background: "rgba(0,196,160,0.05)",
                border: "1px solid rgba(0,196,160,0.35)",
                borderRadius: "10px",
                padding: "18px",
                textAlign: "center",
              }}
            >
              <p style={{
                fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
                fontSize: "2rem",
                color: "var(--teal, #00c4a0)",
                letterSpacing: "0.1em",
                textShadow: "0 0 30px rgba(0,196,160,0.4)",
              }}>
                ◎ {message}
              </p>
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div
              className="animate-slide-up"
              style={{
                marginTop: "14px",
                background: "rgba(255,45,120,0.04)",
                border: "1px solid rgba(255,45,120,0.3)",
                borderRadius: "10px",
                padding: "14px 16px",
                textAlign: "center",
              }}
            >
              <p style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "11px",
                color: "var(--pink, #ff2d78)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}>
                {errorMessage}
              </p>
            </div>
          )}
        </section>
      </main>

      {/* Fullscreen broadcast overlay */}
      {popupMessage && (
        <div
          className="animate-overlay-in"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.92)",
            backdropFilter: "blur(12px)",
            padding: "24px",
          }}
        >
          <div
            className="animate-modal-in"
            style={{
              width: "100%",
              maxWidth: "440px",
              background: "var(--surface, #0d0d0d)",
              border: "1px solid rgba(255,45,120,0.5)",
              borderRadius: "16px",
              padding: "32px 28px",
              textAlign: "center",
              boxShadow: "0 0 80px rgba(255,45,120,0.15), 0 40px 80px rgba(0,0,0,0.8)",
              position: "relative",
            }}
          >
            {/* Animated corner lines */}
            <div style={{
              position: "absolute", top: "12px", left: "12px",
              width: "20px", height: "20px",
              borderTop: "2px solid rgba(255,45,120,0.6)",
              borderLeft: "2px solid rgba(255,45,120,0.6)",
            }} />
            <div style={{
              position: "absolute", top: "12px", right: "12px",
              width: "20px", height: "20px",
              borderTop: "2px solid rgba(255,45,120,0.6)",
              borderRight: "2px solid rgba(255,45,120,0.6)",
            }} />
            <div style={{
              position: "absolute", bottom: "12px", left: "12px",
              width: "20px", height: "20px",
              borderBottom: "2px solid rgba(255,45,120,0.6)",
              borderLeft: "2px solid rgba(255,45,120,0.6)",
            }} />
            <div style={{
              position: "absolute", bottom: "12px", right: "12px",
              width: "20px", height: "20px",
              borderBottom: "2px solid rgba(255,45,120,0.6)",
              borderRight: "2px solid rgba(255,45,120,0.6)",
            }} />

            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "20px" }}>
              <span className="sg-circle" style={{ color: "#ff2d78" }} />
              <span className="sg-triangle" style={{ color: "#ff2d78" }} />
              <span className="sg-square" style={{ color: "#ff2d78" }} />
            </div>

            <p style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "9px",
              color: "#ff2d78",
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              marginBottom: "14px",
            }}>
              Live Command
            </p>

            <h2 style={{
              fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
              fontSize: "clamp(1.8rem, 5vw, 2.8rem)",
              letterSpacing: "0.05em",
              color: "#fff",
              lineHeight: 1.1,
              marginBottom: "24px",
            }}>
              {popupMessage}
            </h2>

            <button
              type="button"
              onClick={() => setPopupMessage("")}
              className="btn-primary"
              style={{ fontFamily: "var(--font-mono, monospace)", width: "100%" }}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}