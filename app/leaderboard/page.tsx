"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type TeamLeaderboardRow = {
  id: string;
  team_id: string | null;
  completion_time: string | null;
  completed: boolean | null;
  active: boolean | null;
  terminated: boolean | null;
  session_end: string | null;
  is_admin: boolean | null;
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

const COLS =
  "id, team_id, completion_time, completed, active, terminated, session_end, is_admin";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
type Status = "Survived" | "Active" | "Terminated" | "Standby";

function deriveStatus(t: TeamLeaderboardRow): Status {
  if (t.completed) return "Survived";
  if (t.terminated) return "Terminated";
  if (!t.active) return "Standby";
  if (t.session_end && new Date(t.session_end).getTime() <= Date.now()) return "Terminated";
  return "Active";
}

function sortTeams(list: TeamLeaderboardRow[]): TeamLeaderboardRow[] {
  const priority: Record<Status, number> = {
    Survived: 0, Active: 1, Standby: 2, Terminated: 3,
  };
  return [...list].sort((a, b) => {
    const sa = deriveStatus(a);
    const sb = deriveStatus(b);
    if (priority[sa] !== priority[sb]) return priority[sa] - priority[sb];
    if (sa === "Survived" && sb === "Survived") {
      const ta = a.completion_time ? new Date(a.completion_time).getTime() : Infinity;
      const tb = b.completion_time ? new Date(b.completion_time).getTime() : Infinity;
      return ta - tb;
    }
    return 0;
  });
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const STATUS_STYLES: Record<Status, { color: string; symbol: string; label: string }> = {
  Survived: { color: "var(--teal, #00c4a0)", symbol: "◎", label: "Survived" },
  Active: { color: "var(--pink, #ff2d78)", symbol: "△", label: "Active" },
  Standby: { color: "#333", symbol: "○", label: "Standby" },
  Terminated: { color: "#ff4040", symbol: "■", label: "Terminated" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function LeaderboardPage() {
  const [teams, setTeams] = useState<TeamLeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTeams = async () => {
    if (!supabase) {
      setErrorMessage("System configuration error.");
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase.from("teams").select(COLS);
    if (error) { setErrorMessage("Failed to load leaderboard."); setIsLoading(false); return; }
    const participants = ((data ?? []) as TeamLeaderboardRow[]).filter(
      (t) => !t.is_admin && !(t.team_id ?? "").toLowerCase().startsWith("admin")
    );
    setTeams(participants);
    setLastUpdated(new Date());
    setIsLoading(false);
  };

  useEffect(() => { fetchTeams(); }, []);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => {
        fetchTeams();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const sorted = useMemo(() => sortTeams(teams), [teams]);

  const survivedCount = sorted.filter(t => deriveStatus(t) === "Survived").length;
  const activeCount = sorted.filter(t => deriveStatus(t) === "Active").length;
  const terminatedCount = sorted.filter(t => deriveStatus(t) === "Terminated").length;

  return (
    <div style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
      <main style={{
        maxWidth: "700px",
        margin: "0 auto",
        padding: "clamp(24px, 4vw, 48px) 16px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}>

        {/* Header */}
        <header className="animate-slide-up card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
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
                The Survival Room
              </p>
              <h1 style={{
                fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
                fontSize: "2rem",
                letterSpacing: "0.06em",
              }}>
                Leaderboard
              </h1>
            </div>
            {/* Live indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                width: "8px", height: "8px",
                borderRadius: "50%",
                background: "#ff2d78",
                boxShadow: "0 0 10px #ff2d78",
                animation: "pulse-pink 2s ease-in-out infinite",
                display: "inline-block",
              }} />
              <span style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "9px",
                color: "#ff2d78",
                letterSpacing: "0.2em",
              }}>
                LIVE
              </span>
            </div>
          </div>
        </header>

        {/* Stats row */}
        <section
          className="animate-slide-up-delay-1"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}
        >
          {[
            { label: "Survived", count: survivedCount, color: "var(--teal, #00c4a0)" },
            { label: "Active", count: activeCount, color: "var(--pink, #ff2d78)" },
            { label: "Terminated", count: terminatedCount, color: "#ff4040" },
          ].map(({ label, count, color }) => (
            <div key={label} className="card" style={{ padding: "14px 16px", textAlign: "center" }}>
              <p style={{
                fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
                fontSize: "2rem",
                letterSpacing: "0.05em",
                color,
                lineHeight: 1,
              }}>
                {count}
              </p>
              <p style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "9px",
                color: "#333",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginTop: "4px",
              }}>
                {label}
              </p>
            </div>
          ))}
        </section>

        {/* Table */}
        <section className="animate-slide-up-delay-2 card" style={{ overflow: "hidden" }}>
          {isLoading ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px",
              gap: "12px",
            }}>
              <div style={{
                width: "24px", height: "24px",
                borderRadius: "50%",
                border: "2px solid rgba(255,45,120,0.15)",
                borderTopColor: "#ff2d78",
                animation: "geo-rotate 0.8s linear infinite",
              }} />
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "11px", color: "#333" }}>
                Loading...
              </span>
            </div>
          ) : errorMessage ? (
            <div style={{
              padding: "24px",
              textAlign: "center",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "11px",
              color: "#ff2d78",
            }}>
              {errorMessage}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="sg-table" style={{ minWidth: "480px" }}>
                <thead>
                  <tr>
                    <th style={{ width: "48px" }}>Rank</th>
                    <th>Team ID</th>
                    <th>Status</th>
                    <th>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t, i) => {
                    const status = deriveStatus(t);
                    const style = STATUS_STYLES[status];
                    const isFirst = i === 0 && status === "Survived";

                    return (
                      <tr
                        key={t.id}
                        style={{
                          animation: `slide-up 0.4s ${i * 0.04}s ease both`,
                          background: isFirst ? "rgba(0,196,160,0.02)" : "transparent",
                        }}
                      >
                        <td>
                          <span
                            className="rank-badge"
                            style={{
                              color: i < 3 && status === "Survived" ? "var(--teal, #00c4a0)" : "var(--pink, #ff2d78)",
                            }}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontWeight: 600,
                            color: "#fff",
                          }}>
                            {t.team_id ?? "—"}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: "12px",
                            color: style.color,
                            fontWeight: 600,
                          }}>
                            <span style={{ fontSize: "9px" }}>{style.symbol}</span>
                            {style.label}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: "12px",
                            color: status === "Survived" ? "var(--teal, #00c4a0)" : "#444",
                          }}>
                            {formatTime(t.completion_time)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{
                        textAlign: "center",
                        padding: "48px",
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: "11px",
                        color: "#222",
                        letterSpacing: "0.2em",
                      }}>
                        NO TEAMS REGISTERED
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Footer */}
        {lastUpdated && (
          <p style={{
            textAlign: "center",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "9px",
            color: "#222",
            letterSpacing: "0.2em",
          }}>
            LAST UPDATED — {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </main>
    </div>
  );
}