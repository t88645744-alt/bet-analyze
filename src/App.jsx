import { useState, useEffect, useCallback } from "react";

const SPORTS = ["Теннис", "Хөлбөмбөг", "Сагсан бөмбөг", "Хоккей", "Бокс", "MMA"];

async function callAI(body) {
  const res = await fetch("/.netlify/functions/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  return res.json();
}

const ANALYSIS_PROMPT = (data) => `Та бол мэргэжлийн спортын бооцооны анализчин. Дараах тоглолтыг шинжил:
- Спорт: ${data.sport}
- Тоглогч 1: ${data.team1} (Одд: ${data.odds1})
- Тоглогч 2: ${data.team2} (Одд: ${data.odds2})
- Тэмцээн: ${data.tournament || "?"}, Талбай: ${data.venue || "?"}
- Форм 1: ${data.form1 || "?"}, Форм 2: ${data.form2 || "?"}
- Нэмэлт: ${data.extra || "байхгүй"}
JSON хэлбэрээр хариул:
{"winner":"нэр","confidence":"өндөр/дунд/бага","probability1":number,"probability2":number,"value_bet":"team1/team2/байхгүй","reasoning":"тайлбар","key_factors":["1","2","3"],"risk":"өндөр/дунд/бага","recommendation":"зөвлөмж"}
Зөвхөн JSON.`;

function kellyFraction(odds, prob) {
  const p = prob / 100, b = odds - 1;
  return Math.max(0, (b * p - (1 - p)) / b);
}

export default function App() {
  const [tab, setTab] = useState("live");
  const [form, setForm] = useState({ sport: "Теннис", team1: "", team2: "", odds1: "", odds2: "", tournament: "", venue: "", form1: "", form2: "", extra: "" });
  const [bankroll, setBankroll] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchMsg, setFetchMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem("bets_history") || "[]")); } catch (_) {}
  }, []);

  const saveHistory = useCallback((entry) => {
    setHistory(prev => {
      const updated = [entry, ...prev].slice(0, 50);
      try { localStorage.setItem("bets_history", JSON.stringify(updated)); } catch (_) {}
      return updated;
    });
  }, []);

  const loadLiveMatches = async () => {
    setLiveLoading(true);
    try {
      const res = await fetch("/.netlify/functions/live-matches");
      const data = await res.json();
      setLiveMatches(Array.isArray(data) ? data : []);
    } catch (_) { setLiveMatches([]); }
    setLiveLoading(false);
  };

  useEffect(() => { if (tab === "live") loadLiveMatches(); }, [tab]);

  const selectMatch = (match) => {
    setForm(f => ({
      ...f,
      team1: match.player1, team2: match.player2,
      odds1: match.odds1?.toString() || "", odds2: match.odds2?.toString() || "",
      tournament: match.tournament, venue: match.surface || "",
      form1: "", form2: "", extra: match.score ? `Одоогийн байдал: ${match.score}` : ""
    }));
    setResult(null);
    setTab("analyze");
  };

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fetchStats = async () => {
    if (!form.team1 || !form.team2) { setFetchMsg("Тоглогчдын нэр оруулна уу."); return; }
    setFetchLoading(true); setFetchMsg("🔍 Хайж байна...");
    try {
      const data = await callAI({
        model: "meta-llama/llama-3.3-70b-instruct:free", max_tokens: 800,
        messages: [{ role: "user", content: `Search web stats for ${form.team1} vs ${form.team2} in ${form.sport}. Return only JSON: {"form1":"W W L W W","form2":"L W W L W","rank1":"ranking","rank2":"ranking","h2h":"record","extra":"news"}` }]
      });
      const text = data.choices?.[0]?.message?.content || data.content?.[0]?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setForm(f => ({ ...f, form1: parsed.form1 || f.form1, form2: parsed.form2 || f.form2, extra: [parsed.h2h && `H2H: ${parsed.h2h}`, parsed.extra].filter(Boolean).join(" | ") }));
      setFetchMsg("✅ Татагдлаа!");
    } catch (_) { setFetchMsg("⚠️ Олдсонгүй, гараар оруулна уу."); }
    setFetchLoading(false);
    setTimeout(() => setFetchMsg(""), 3000);
  };

  const analyze = async () => {
    if (!form.team1 || !form.team2 || !form.odds1 || !form.odds2) { setError("Тоглогч болон одд оруулна уу."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const data = await callAI({ model: "meta-llama/llama-3.3-70b-instruct:free", max_tokens: 1000, messages: [{ role: "user", content: ANALYSIS_PROMPT(form) }] });
      const text = data.choices?.[0]?.message?.content || data.content?.[0]?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setResult(parsed);
      saveHistory({ id: Date.now(), date: new Date().toLocaleString("mn-MN"), sport: form.sport, team1: form.team1, team2: form.team2, odds1: form.odds1, odds2: form.odds2, ...parsed });
    } catch (_) { setError("Алдаа гарлаа, дахин оролдоно уу."); }
    setLoading(false);
  };

  const cc = c => c === "өндөр" ? "#22c55e" : c === "дунд" ? "#f59e0b" : "#ef4444";
  const kelly1 = result ? kellyFraction(parseFloat(form.odds1), result.probability1) : 0;
  const kelly2 = result ? kellyFraction(parseFloat(form.odds2), result.probability2) : 0;
  const br = parseFloat(bankroll) || 0;
  const bestK = result?.value_bet === "team1" ? kelly1 : result?.value_bet === "team2" ? kelly2 : Math.max(kelly1, kelly2);

  const tabs = [["live", "🎾 Live"], ["analyze", "🔍 Анализ"], ["history", `📋 Түүх${history.length ? ` (${history.length})` : ""}`]];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: "20px 14px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 30 }}>🎯</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 0", background: "linear-gradient(135deg, #a78bfa, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Бооцооны AI Анализ</h1>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18, background: "#111827", borderRadius: 12, padding: 4, border: "1px solid #1f2937" }}>
          {tabs.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: "9px 4px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: tab === key ? "linear-gradient(135deg, #7c3aed, #2563eb)" : "transparent", color: tab === key ? "#fff" : "#64748b" }}>{label}</button>
          ))}
        </div>

        {/* ===== LIVE TAB ===== */}
        {tab === "live" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>Өнөөдрийн тоглолтууд</span>
              <button onClick={loadLiveMatches} disabled={liveLoading} style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", color: "#60a5fa", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                {liveLoading ? "⏳" : "🔄 Шинэчлэх"}
              </button>
            </div>

            {liveLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>⏳</div>
                <p>Live тоглолтуудыг татаж байна...</p>
              </div>
            ) : liveMatches.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#374151" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎾</div>
                <p>Тоглолт олдсонгүй</p>
                <button onClick={loadLiveMatches} style={{ marginTop: 12, background: "linear-gradient(135deg, #7c3aed, #2563eb)", border: "none", color: "#fff", borderRadius: 8, padding: "10px 20px", cursor: "pointer" }}>Дахин хайх</button>
              </div>
            ) : (
              liveMatches.map((match) => (
                <div key={match.id} onClick={() => selectMatch(match)} style={{ background: "#111827", borderRadius: 12, padding: 16, border: "1px solid #1f2937", marginBottom: 10, cursor: "pointer", transition: "border-color 0.2s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {match.status === "live" && <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, animation: "pulse 1.5s infinite" }}>● LIVE</span>}
                      <span style={{ fontSize: 11, color: "#a78bfa" }}>{match.tournament}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{match.surface}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{match.player1}</div>
                      <div style={{ fontSize: 13, color: "#a78bfa", fontWeight: 700, marginTop: 4 }}>{match.odds1}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#4b5563", fontWeight: 700 }}>VS</div>
                      {match.score && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>{match.score}</div>}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{match.player2}</div>
                      <div style={{ fontSize: 13, color: "#60a5fa", fontWeight: 700, marginTop: 4 }}>{match.odds2}</div>
                    </div>
                  </div>

                  <div style={{ background: "rgba(167,139,250,0.08)", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                    <span style={{ fontSize: 12, color: "#a78bfa" }}>🔍 Дарж анализ хийх</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== ANALYZE TAB ===== */}
        {tab === "analyze" && (
          <>
            <div style={{ background: "#111827", borderRadius: 16, padding: 20, border: "1px solid #1f2937", marginBottom: 16 }}>
              <div style={{ marginBottom: 16 }}>
                <Lbl>Спортын төрөл</Lbl>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {SPORTS.map(s => <button key={s} onClick={() => update("sport", s)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: form.sport === s ? "1px solid #a78bfa" : "1px solid #374151", background: form.sport === s ? "rgba(167,139,250,0.15)" : "transparent", color: form.sport === s ? "#a78bfa" : "#94a3b8" }}>{s}</button>)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "end", marginBottom: 14 }}>
                <div><Lbl>Тоглогч 1</Lbl><Inp value={form.team1} onChange={v => update("team1", v)} placeholder="Нэр" /><div style={{marginTop:6}}><Lbl>Одд</Lbl></div><Inp value={form.odds1} onChange={v => update("odds1", v)} placeholder="1.85" type="number" /></div>
                <div style={{ textAlign: "center", paddingBottom: 8, color: "#4b5563", fontWeight: 700 }}>VS</div>
                <div><Lbl>Тоглогч 2</Lbl><Inp value={form.team2} onChange={v => update("team2", v)} placeholder="Нэр" /><div style={{marginTop:6}}><Lbl>Одд</Lbl></div><Inp value={form.odds2} onChange={v => update("odds2", v)} placeholder="2.10" type="number" /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><Lbl>Тэмцээн</Lbl><Inp value={form.tournament} onChange={v => update("tournament", v)} placeholder="Stuttgart" /></div>
                <div><Lbl>Талбай</Lbl><Inp value={form.venue} onChange={v => update("venue", v)} placeholder="Clay" /></div>
              </div>
              <button onClick={fetchStats} disabled={fetchLoading} style={{ width: "100%", padding: "9px", borderRadius: 8, border: "1px solid #374151", background: "rgba(96,165,250,0.08)", color: "#60a5fa", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
                {fetchLoading ? "⏳" : "🌐 ATP/WTA статистик татах"}
              </button>
              {fetchMsg && <p style={{ margin: "0 0 10px", fontSize: 12, color: fetchMsg.startsWith("✅") ? "#22c55e" : "#f59e0b" }}>{fetchMsg}</p>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><Lbl>Форм 1</Lbl><Inp value={form.form1} onChange={v => update("form1", v)} placeholder="W W L W W" /></div>
                <div><Lbl>Форм 2</Lbl><Inp value={form.form2} onChange={v => update("form2", v)} placeholder="L W W L W" /></div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <Lbl>Нэмэлт мэдээлэл</Lbl>
                <textarea value={form.extra} onChange={e => update("extra", e.target.value)} placeholder="Гэмтэл, H2H гэх мэт..." rows={2} style={{ width: "100%", background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#e2e8f0", padding: "9px 12px", fontSize: 14, resize: "none", boxSizing: "border-box", marginTop: 4, outline: "none", fontFamily: "inherit" }} />
              </div>
              {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{error}</p>}
              <button onClick={analyze} disabled={loading} style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: loading ? "#374151" : "linear-gradient(135deg, #7c3aed, #2563eb)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer" }}>
                {loading ? "⏳ Шинжилж байна..." : "🔍 AI-аар Шинжлэх"}
              </button>
            </div>

            {result && (
              <div style={{ animation: "fadeIn 0.4s ease" }}>
                <div style={{ background: "#111827", borderRadius: 16, padding: 20, border: "1px solid #1f2937", marginBottom: 14 }}>
                  <div style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 12, padding: 14, marginBottom: 14, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, letterSpacing: 1 }}>ЯЛАХ МАГАДЛАЛТАЙ</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#a78bfa" }}>{result.winner}</div>
                    <div style={{ marginTop: 6, display: "flex", justifyContent: "center", gap: 16, fontSize: 13 }}>
                      <span style={{ color: "#94a3b8" }}>Итгэлцэл: <span style={{ color: cc(result.confidence), fontWeight: 600 }}>{result.confidence}</span></span>
                      <span style={{ color: "#94a3b8" }}>Эрсдэл: <span style={{ color: cc(result.risk), fontWeight: 600 }}>{result.risk}</span></span>
                    </div>
                  </div>
                  <ProbBar label={form.team1} pct={result.probability1} color="#a78bfa" />
                  <ProbBar label={form.team2} pct={result.probability2} color="#60a5fa" />
                  {result.value_bet !== "байхгүй" && <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: 12, marginTop: 12, display: "flex", gap: 10 }}><span>💰</span><div><div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>VALUE BET</div><div style={{ fontSize: 13, color: "#94a3b8" }}>{result.value_bet === "team1" ? form.team1 : form.team2} дээр тавихыг зөвлөнө</div></div></div>}
                  <div style={{ marginTop: 14 }}>{result.key_factors?.map((f, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 13 }}><span style={{ color: "#a78bfa" }}>•</span><span style={{ color: "#cbd5e1" }}>{f}</span></div>)}</div>
                  <div style={{ background: "#1f2937", borderRadius: 10, padding: 12, marginTop: 12 }}><p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#cbd5e1" }}>{result.reasoning}</p></div>
                  <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: 12, marginTop: 12 }}><p style={{ margin: 0, fontSize: 14, color: "#cbd5e1" }}>{result.recommendation}</p></div>
                </div>

                <div style={{ background: "#111827", borderRadius: 16, padding: 20, border: "1px solid #1f2937" }}>
                  <Lbl>📐 Kelly Criterion — Нийт хөрөнгө (₮)</Lbl>
                  <Inp value={bankroll} onChange={setBankroll} placeholder="100,000" type="number" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                    <KCard name={form.team1} odds={form.odds1} k={kelly1} br={br} color="#a78bfa" />
                    <KCard name={form.team2} odds={form.odds2} k={kelly2} br={br} color="#60a5fa" />
                  </div>
                  {br > 0 && result.value_bet !== "байхгүй" && (
                    <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10, padding: 14, marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, marginBottom: 8 }}>🎯 Оновчтой бооцоо</div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div><div style={{ fontSize: 11, color: "#94a3b8" }}>Full Kelly</div><div style={{ color: "#22c55e", fontWeight: 700, fontSize: 18 }}>₮{Math.round(bestK * br).toLocaleString()}</div></div>
                        <div><div style={{ fontSize: 11, color: "#94a3b8" }}>Half Kelly</div><div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 18 }}>₮{Math.round(bestK * 0.5 * br).toLocaleString()}</div></div>
                        <div><div style={{ fontSize: 11, color: "#94a3b8" }}>Хувь</div><div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 18 }}>{(bestK * 100).toFixed(1)}%</div></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== HISTORY TAB ===== */}
        {tab === "history" && (
          <div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#374151" }}><div style={{ fontSize: 36 }}>📋</div><p>Түүх хоосон байна</p></div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                  <span style={{ color: "#64748b", fontSize: 13 }}>Нийт {history.length}</span>
                  <button onClick={() => { setHistory([]); localStorage.removeItem("bets_history"); }} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>🗑 Цэвэрлэх</button>
                </div>
                {history.map(h => (
                  <div key={h.id} style={{ background: "#111827", borderRadius: 12, padding: 14, border: "1px solid #1f2937", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>{h.date}</span>
                      <span style={{ fontSize: 11, color: "#a78bfa", background: "rgba(167,139,250,0.1)", padding: "2px 8px", borderRadius: 8 }}>{h.sport}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ textAlign: "center", flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: h.winner === h.team1 ? "#a78bfa" : "#e2e8f0" }}>{h.team1}</div><div style={{ fontSize: 11, color: "#64748b" }}>{h.odds1} | {h.probability1}%</div></div>
                      <div style={{ color: "#374151", fontWeight: 700, padding: "0 10px" }}>VS</div>
                      <div style={{ textAlign: "center", flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: h.winner === h.team2 ? "#60a5fa" : "#e2e8f0" }}>{h.team2}</div><div style={{ fontSize: 11, color: "#64748b" }}>{h.odds2} | {h.probability2}%</div></div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Tag color="#a78bfa">🏆 {h.winner}</Tag>
                      <Tag color={cc(h.confidence)}>Итгэлцэл: {h.confidence}</Tag>
                      {h.value_bet !== "байхгүй" && <Tag color="#22c55e">💰 Value</Tag>}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        <style>{`
          @keyframes fadeIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
          @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        `}</style>
      </div>
    </div>
  );
}

const Lbl = ({ children }) => <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 5 }}>{children}</div>;
const Inp = ({ value, onChange, placeholder, type = "text" }) => <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#e2e8f0", padding: "9px 12px", fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} />;
const ProbBar = ({ label, pct, color }) => <div style={{ marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ color: "#cbd5e1" }}>{label}</span><span style={{ color, fontWeight: 600 }}>{pct}%</span></div><div style={{ background: "#1f2937", borderRadius: 4, height: 6 }}><div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4 }} /></div></div>;
const KCard = ({ name, odds, k, br, color }) => <div style={{ background: "#1f2937", borderRadius: 10, padding: 10, border: `1px solid ${k > 0 ? color + "33" : "#374151"}` }}><div style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div><div style={{ fontSize: 11, color: "#64748b" }}>Kelly: {(k * 100).toFixed(1)}%</div>{k <= 0 ? <div style={{ fontSize: 12, color: "#4b5563" }}>Тавихгүй</div> : br > 0 ? <><div style={{ fontSize: 12, color: "#94a3b8" }}>Full: <span style={{ color, fontWeight: 600 }}>₮{Math.round(k * br).toLocaleString()}</span></div><div style={{ fontSize: 12, color: "#94a3b8" }}>Half: <span style={{ color: "#f59e0b", fontWeight: 600 }}>₮{Math.round(k * 0.5 * br).toLocaleString()}</span></div></> : <div style={{ fontSize: 12, color: "#4b5563" }}>Хөрөнгө оруулна уу</div>}</div>;
const Tag = ({ children, color }) => <span style={{ fontSize: 11, color, background: color + "15", border: `1px solid ${color}33`, borderRadius: 8, padding: "3px 8px" }}>{children}</span>;
