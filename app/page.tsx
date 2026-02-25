import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden">

      {/* Decorative large circle BG */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(90vw, 700px)",
          height: "min(90vw, 700px)",
          borderRadius: "50%",
          border: "1px solid rgba(255,45,120,0.04)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(60vw, 480px)",
          height: "min(60vw, 480px)",
          borderRadius: "50%",
          border: "1px solid rgba(255,45,120,0.03)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">

        {/* Hero */}
        <section className="animate-slide-up">
          {/* Geometric symbols */}
          <div className="mb-6 flex items-center gap-4">
            <span className="sg-circle text-pink opacity-60" />
            <span className="sg-triangle text-pink opacity-60" />
            <span className="sg-square text-pink opacity-60" />
            <span
              style={{
                flex: 1,
                height: "1px",
                background: "linear-gradient(90deg, rgba(255,45,120,0.3), transparent)",
              }}
            />
          </div>

          <p
            style={{
              fontFamily: "var(--font-mono, 'Share Tech Mono', monospace)",
              fontSize: "11px",
              color: "var(--pink, #ff2d78)",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              marginBottom: "12px",
            }}
          >
            Controlled Session Protocol
          </p>

          <h1
            style={{
              fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
              fontSize: "clamp(3rem, 10vw, 6rem)",
              lineHeight: 0.95,
              letterSpacing: "0.03em",
              marginBottom: "8px",
            }}
          >
            The
            <br />
            <span
              style={{
                color: "var(--pink, #ff2d78)",
                textShadow: "0 0 40px rgba(255,45,120,0.3)",
              }}
            >
              Survival
            </span>
            <br />
            Room
          </h1>

          <p
            className="animate-slide-up-delay-1"
            style={{
              color: "#555",
              fontSize: "13px",
              lineHeight: 1.7,
              maxWidth: "420px",
              marginTop: "20px",
            }}
          >
            A controlled survival-based escape protocol combining psychological
            pressure, technical thinking, and strategic decision-making.
          </p>

          <div className="animate-slide-up-delay-2" style={{ marginTop: "28px" }}>
            <Link
              href="/login"
              className="btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              <span className="sg-circle" style={{ color: "white", opacity: 0.7 }} />
              Enter Protocol
            </Link>
          </div>
        </section>

        {/* Event Info */}
        <section className="animate-slide-up-delay-2">
          <div className="section-label" style={{ marginBottom: "16px" }}>
            <span className="sg-triangle text-pink" />
            Event Intel
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "10px",
            }}
          >
            {[
              { label: "Date", value: "27 February" },
              { label: "Time", value: "2:30 – 5:30 PM" },
              { label: "Team Size", value: "4 Players" },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="card"
                style={{ padding: "16px 14px" }}
              >
                <p
                  style={{
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    color: "#444",
                    marginBottom: "8px",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {label}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
                    fontSize: "1.2rem",
                    letterSpacing: "0.05em",
                    color: "#fff",
                    lineHeight: 1.2,
                  }}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Rules */}
        <section className="animate-slide-up-delay-3">
          <div className="section-label" style={{ marginBottom: "16px" }}>
            <span className="sg-square text-pink" />
            Protocol Rules
          </div>
          <div className="card scan-line" style={{ padding: "20px" }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
              {[
                "Arrive at least 15 minutes before the session begins.",
                "Teams must stay together throughout each survival round.",
                "No phones or external assistance during active sessions.",
                "Follow all controller instructions and safety boundaries.",
                "Maximum 2 final-key submission attempts per team.",
                "Session timer is final — no extensions will be granted.",
              ].map((rule, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: "14px",
                    alignItems: "flex-start",
                    color: "#666",
                    fontSize: "13px",
                    lineHeight: 1.6,
                    animationDelay: `${i * 0.06}s`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "10px",
                      color: "var(--pink, #ff2d78)",
                      marginTop: "3px",
                      minWidth: "20px",
                      opacity: 0.7,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Footer nav */}
        <div
          className="animate-slide-up-delay-4"
          style={{
            display: "flex",
            gap: "20px",
            justifyContent: "center",
            paddingTop: "8px",
          }}
        >
          <Link
            href="/login"
            className="footer-nav-link"
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "11px",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            △ Login
          </Link>
        </div>
      </main>
    </div>
  );
}