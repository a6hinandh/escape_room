"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { haptics } from "@/lib/haptics";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const adminEmailList = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isConfigured = useMemo(() => Boolean(supabase), []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    haptics.tap();

    if (!isConfigured || !supabase) {
      setErrorMessage("System configuration error. Contact Controller.");
      haptics.error();
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Enter a valid identity email.");
      haptics.error();
      return;
    }

    // Admins can log in purely via env allowlist (useful when DB is empty/reset).
    if (adminEmailList.includes(normalizedEmail)) {
      setSuccessMessage("Controller access granted. Entering control room...");
      haptics.success();
      localStorage.setItem("teamEmail", normalizedEmail);
      localStorage.setItem("teamId", "admin");
      localStorage.setItem("role", "admin");
      router.push("/admin");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .ilike("email", normalizedEmail)
        .maybeSingle();

      if (error) {
        setErrorMessage("Verification system unavailable. Try again.");
        haptics.error();
        return;
      }

      if (!data) {
        setErrorMessage("ACCESS DENIED — Identity Not Authorized for Survival Protocol");
        haptics.error();
        return;
      }

      // Block terminated teams from logging in
      if (data.terminated) {
        setErrorMessage("ACCESS REVOKED — Your session has been permanently terminated by the Controller.");
        haptics.error();
        return;
      }

      setSuccessMessage("Identity verified. Entering protocol...");
      haptics.success();
      const teamData = data as {
        email?: string | null;
        team_id?: string | null;
        is_admin?: boolean | null;
      };

      const isAdmin =
        Boolean(teamData.is_admin) ||
        (teamData.team_id ?? "").toLowerCase().startsWith("admin") ||
        adminEmailList.includes(normalizedEmail);

      localStorage.setItem("teamEmail", teamData.email ?? normalizedEmail);
      localStorage.setItem("teamId", teamData.team_id ?? "");
      localStorage.setItem("role", isAdmin ? "admin" : "participant");
      router.push(isAdmin ? "/admin" : "/dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--black, #050505)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background geometric shapes */}
      <div aria-hidden="true" style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "600px", height: "600px",
        borderRadius: "50%",
        border: "1px solid rgba(255,45,120,0.04)",
        pointerEvents: "none",
      }} />
      <div aria-hidden="true" style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%) rotate(45deg)",
        width: "400px", height: "400px",
        border: "1px solid rgba(255,45,120,0.025)",
        pointerEvents: "none",
      }} />

      {/* Card */}
      <div
        className="animate-scale-in"
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "var(--surface, #0d0d0d)",
          border: "1px solid rgba(255,45,120,0.2)",
          borderRadius: "16px",
          padding: "32px 28px",
          position: "relative",
          boxShadow: "0 0 60px rgba(255,45,120,0.05), 0 40px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Top symbols */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "24px" }}>
          <span className="sg-circle" style={{ color: "var(--pink, #ff2d78)" }} />
          <span className="sg-triangle" style={{ color: "var(--pink, #ff2d78)" }} />
          <span className="sg-square" style={{ color: "var(--pink, #ff2d78)" }} />
        </div>

        <p style={{
          fontFamily: "var(--font-mono, 'Share Tech Mono', monospace)",
          fontSize: "10px",
          color: "var(--pink, #ff2d78)",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          marginBottom: "8px",
        }}>
          Identity Verification
        </p>

        <h1
          className="animate-flicker"
          style={{
            fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
            fontSize: "2.4rem",
            letterSpacing: "0.04em",
            lineHeight: 1,
            marginBottom: "4px",
          }}
        >
          The Survival Room
        </h1>

        <p style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "11px",
          color: "#444",
          letterSpacing: "0.15em",
          marginBottom: "24px",
        }}>
          CONTROLLED SESSION PROTOCOL
        </p>

        {/* Divider */}
        <div style={{
          height: "1px",
          background: "linear-gradient(90deg, rgba(255,45,120,0.3), transparent)",
          marginBottom: "24px",
        }} />

        <p style={{ fontSize: "13px", color: "#666", lineHeight: 1.6, marginBottom: "20px" }}>
          Enter the email address mapped to your Team ID by the Controller.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "10px",
                color: "#444",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: "8px",
              }}
            >
              Authorized Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="team@example.com"
              className="input-sg"
              autoComplete="email"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary"
            style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", marginTop: "4px" }}
          >
            {isLoading ? (
              <span style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
                <span style={{
                  width: "12px", height: "12px",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "geo-rotate 0.7s linear infinite",
                }} />
                Verifying...
              </span>
            ) : "Verify Identity"}
          </button>
        </form>

        {/* Error */}
        {errorMessage && (
          <div
            className="animate-slide-up animate-border-flash"
            style={{
              marginTop: "16px",
              background: "rgba(255,45,120,0.05)",
              border: "1px solid rgba(255,45,120,0.4)",
              borderRadius: "8px",
              padding: "12px 14px",
              textAlign: "center",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "11px",
              color: "var(--pink, #ff2d78)",
              letterSpacing: "0.08em",
              lineHeight: 1.5,
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Success */}
        {successMessage && (
          <div
            className="animate-slide-up"
            style={{
              marginTop: "16px",
              background: "rgba(0,196,160,0.05)",
              border: "1px solid rgba(0,196,160,0.3)",
              borderRadius: "8px",
              padding: "12px 14px",
              textAlign: "center",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "11px",
              color: "var(--teal, #00c4a0)",
              letterSpacing: "0.08em",
            }}
          >
            {successMessage}
          </div>
        )}

        {/* Bottom number */}
        <p style={{
          marginTop: "24px",
          textAlign: "center",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "9px",
          color: "#2a2a2a",
          letterSpacing: "0.2em",
        }}>
          PROTOCOL — 001
        </p>
      </div>
    </div>
  );
}