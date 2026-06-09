import { useState, useEffect, useCallback } from "react";

const SPORTS = ["Теннис", "Хөлбөмбөг", "Сагсан бөмбөг", "Хоккей", "Бокс", "MMA"];

// ✅ /api/analyze руу дуудна — Anthropic API key нуугдсан байна
async function callClaude(body) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const ANALYSIS_PROMPT = (data) => `
Та бол мэргэжлийн спортын бооцооны анализчин. Дараах тоглолтын мэдээллийг шинжилж, тооцоо гаргана уу.

Тоглолтын мэдээлэл:
- Спорт: ${data.sport}
- Тоглогч/Баг 1: ${data.team1} (Одд: ${data.odds1})
- Тоглогч/Баг 2: ${data.team2} (Одд: ${data.odds2})
- Тэмцээн: ${data.tournament || "Тодорхойгүй"}
- Талбай / Гадна нөхцөл: ${data.venue || "Тодорхойгүй"}
- Сүүлийн үеийн форм 1: ${data.form1 || "Мэдээлэл байхгүй"}
- Сүүлийн үеийн форм 2: ${data.form2 || "Мэдээлэл байхгүй"}
- Нэмэлт мэдээлэл: ${data.extra || "Байхгүй"}

Дараах форматаар хариулна уу (JSON):
{
  "winner": "хэн ялах магадлалтай тэдний нэр",
  "confidence": "өндөр/дунд/бага",
  "probability1": number,
  "probability2": number,
  "value_bet": "team1 эсвэл team2 эсвэл байхгүй",
  "reasoning": "3-5 өгүүлбэрт шинжилгээний тайлбар",
  "key_factors": ["хүчин зүйл 1", "хүчин зүйл 2", "хүчин зүйл 3"],
  "risk": "өндөр/дунд/бага",
  "recommendation": "бооцоо тавих зөвлөмж"
}
Зөвхөн JSON буцаана уу.
`;

const FETCH_STATS_PROMPT = (team1, team2, sport, tournament) => `
You are a sports data assistant. Search the web for the most recent statistics for these ${sport} players/teams: ${team1} vs ${team2}. Tournament: ${tournament || "recent"}.
Return ONLY JSON, no markdown:
{
  "form1": "last 5 results W/L",
  "form2": "last 5 results W/L",
  "rank1": "current ranking",
  "rank2": "current ranking",
  "h2h": "head to head record",
  "extra": "key injuries or recent news in 1-2 sentences"
}`;

function kellyFraction(odds, probability) {
  const p = probability / 100;
  const b = odds - 1;
  return Math.max(0, (b * p - (1 - p)) / b);
}

export default function BettingAnalyzer() {
  const [tab, setTab] = useState("analyze");
  const [form, setForm] = useState({ sport: "Теннис", team1: "", team2: "", odds1: "", odds2: "", tournament: "", venue: "", form1: "", form2: "", extra: "" });
  const [bankroll, setBankroll] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchMsg, setFetchMsg] = useState("");
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try { const h = JSON.parse(localStorage.getItem("bets_history") || "[]"); setHistory(h); } catch (_) {}
  }, []);

  const saveHistory = useCallback((entry) => {
    setHistory(prev => {
      const updated = [entry, ...prev].slice(0, 50);
      try { localStorage.setItem("bets_history", JSON.stringify(updated)); } catch (_) {}
      return updated;
    });
  }, []);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fetchStats = async () => {
    if (!form.team1 || !form.team2) { setFetchMsg("Эхлээд хоёр тоглогчийн нэрийг оруулна уу."); return; }
    setFetchLoading(true); setFetchMsg("🔍 Мэдээлэл хайж байна...");
    try {
      const data = await callClaude({
        model: "claude-sonnet-4-20250514", max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: FETCH_STATS_PROMPT(form.team1, form.team2, form.sport, form.tournament) }]
      });
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setForm(f => ({
        ...f, form1: parsed.form1 || f.form1, form2: parsed.form2 || f.form2,
        extra: [parsed.h2h && `H2H: ${parsed.h2h}`, parsed.rank1 && `${form.team1} rank: ${parsed.rank1}`, parsed.rank2 && `${form.team2} rank: ${parsed.rank2}`, parsed.extra].filter(Boolean).join(" | ")
      }));
      setFetchMsg("✅ Мэдээлэл татагдлаа!");
    } catch (e) { setFetchMsg("⚠️ Мэдээлэл олдсонгүй, гараар оруулна уу."); }
    setFetchLoading(false);
    setTimeout(() => setFetchMsg(""), 4000);
  };

  const analyze = async () => {
    if (!form.team1 || !form.team2 || !form.odds1 || !form.odds2) { setError("Тоглогч/баг болон одд заавал оруулна уу."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const data = await callClaude({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: ANALYSIS_PROMPT(form) }] });
      const text = data.content?.[0]?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setResult(parsed);
      saveHistory({ id: Date.now(), date: new Date().toLocaleString("mn-MN"), sport: form.sport, team1: form.team1, team2: form.team2, odds1: form.odds1, odds2: form.odds2, ...parsed });
    } catch (e) { setError("Анализ хийхэд алдаа гарлаа."); }
    setLoading(false);
  };

  const confColor = c => c === "өндөр" ? "#22c55e" : c === "дунд" ? "#f59e0b" : "#ef4444";
  const riskColor = r => r === "бага" ? "#22c55e" : r === "дунд" ? "#f59e0b" : "#ef4444";
  const kelly1 = result ? kellyFraction(parseFloat(form.odds1), result.probability1) : 0;
  const kelly2 = result ? kellyFraction(parseFloat(form.odds2), result.probability2) : 0;
  const br = parseFloat(bankroll) || 0;
  const bestKelly = result?.value_bet === "team1" ? kelly1 : result?.value_bet === "team2" ? kelly2 : Math.max(kelly1, kelly2);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>🎯</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, background: "linear-gradient(135deg, #a78bfa, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Бооцооны AI Анализ</h1>
          <p style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>Мэдээлэл оруулаад AI-аар шинжлүүл</p>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#111827", borderRadius: 12, padding: 4, border: "1px solid #1f2937" }}>
          {[["analyze", "🔍 Анализ"], ["history", `📋 Түүх ${history.length > 0 ? `(${history.length})` : ""}`]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, background: tab === key ? "linear-gradient(135deg, #7c3aed, #2563eb)" : "transparent", color: tab === key ? "#fff" : "#64748b" }}>{label}</button>
          ))}
        </div>

        {tab === "analyze" && (
          <>
            <div style={{ background: "#111827", borderRadius: 16, padding: 24, border: "1px solid #1f2937", marginBottom: 20 }}>
              <div style={{ marginBottom: 20 }}>
                <Lbl>Спортын төрөл</Lbl>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {SPORTS.map(s => <button key={s} onClick={() => update("sport", s)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: form.sport === s ? "1px solid #a78bfa" : "1px solid #374151", background: form.sport === s ? "rgba(167,139,250,0.15)" : "transparent", color: form.sport === s ? "#a78bfa" : "#94a3b8" }}>{s}</button>)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "end", marginBottom: 16 }}>
                <div><Lbl>Тоглогч / Баг 1</Lbl><Inp value={form.team1} onChange={v => update("team1", v)} placeholder="Нэр оруулах" /><div style={{marginTop:8}}><Lbl>Одд</Lbl></div><Inp value={form.odds1} onChange={v => update("odds1", v)} placeholder="1.85" type="number" /></div>
                <div style={{ textAlign: "center", paddingBottom: 8, color: "#4b5563", fontWeight: 700, fontSize: 18 }}>VS</div>
                <div><Lbl>Тоглогч / Баг 2</Lbl><Inp value={form.team2} onChange={v => update("team2", v)} placeholder="Нэр оруулах" /><div style={{marginTop:8}}><Lbl>Одд</Lbl></div><Inp value={form.odds2} onChange={v => update("odds2", v)} placeholder="2.10" type="number" /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><Lbl>Тэмцээн</Lbl><Inp value={form.tournament} onChange={v => update("tournament", v)} placeholder="Wimbledon" /></div>
                <div><Lbl>Талбай / Нөхцөл</Lbl><Inp value={form.venue} onChange={v => update("venue", v)} placeholder="Хатуу гадаргуу" /></div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <button onClick={fetchStats} disabled={fetchLoading} style={{ width: "100%", padding: "10px", borderRadius: 9, border: "1px solid #374151", background: "rgba(96,165,250,0.08)", color: "#60a5fa", fontSize: 13, fontWeight: 600, cursor: fetchLoading ? "default" : "pointer" }}>
                  {fetchLoading ? "⏳ Хайж байна..." : "🌐 ATP/WTA Мэдээлэл Автоматаар Татах"}
                </button>
                {fetchMsg && <p style={{ margin: "6px 0 0", fontSize: 12, color: fetchMsg.startsWith("✅") ? "#22c55e" : "#f59e0b" }}>{fetchMsg}</p>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div><Lbl>1-р тоглогчийн форм</Lbl><Inp value={form.form1} onChange={v => update("form1", v)} placeholder="W W L W W" /></div>
                <div><Lbl>2-р тоглогчийн форм</Lbl><Inp value={form.form2} onChange={v => update("form2", v)} placeholder="L W W L W" /></div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <Lbl>Нэмэлт мэдээлэл</Lbl>
                <textarea value={form.extra} onChange={e => update("extra", e.target.value)} placeholder="Гэмтэл, H2H гэх мэт..." rows={2} style={{ width: "100%", background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#e2e8f0", padding: "10px 12px", fontSize: 14, resize: "none", boxSizing: "border-box", marginTop: 4, outline: "none", fontFamily: "inherit" }} />
              </div>
              {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <button onClick={analyze} disabled={loading} style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: loading ? "#374151" : "linear-gradient(135deg, #7c3aed, #2563eb)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer" }}>
                {loading ? "⏳ Шинжилж байна..." : "🔍 AI-аар Шинжлэх"}
              </button>
            </div>

            {result && (
              <div style={{ animation: "fadeIn 0.4s ease" }}>
                <div style={{ background: "#111827", borderRadius: 16, padding: 24, border: "1px solid #1f2937", marginBottom: 16 }}>
                  <SecTitle>📊 Шинжилгээний үр дүн</SecTitle>
                  <div style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, letterSpacing: 1 }}>ЯЛАХ МАГАДЛАЛТАЙ</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#a78bfa" }}>{result.winner}</div>
                    <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 20, fontSize: 13 }}>
                      <span style={{ color: "#94a3b8" }}>Итгэлцэл: <span style={{ color: confColor(result.confidence), fontWeight: 600 }}>{result.confidence}</span></span>
                      <span style={{ color: "#94a3b8" }}>Эрсдэл: <span style={{ color: riskColor(result.risk), fontWeight: 600 }}>{result.risk}</span></span>
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}><SecTitle>Ялах магадлал</SecTitle><ProbBar label={form.team1} pct={result.probability1} color="#a78bfa" /><ProbBar label={form.team2} pct={result.probability2} color="#60a5fa" /></div>
                  {result.value_bet !== "байхгүй" && <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 20 }}>💰</span><div><div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>VALUE BET ИЛЭРСЭН</div><div style={{ fontSize: 13, color: "#94a3b8" }}>{result.value_bet === "team1" ? form.team1 : form.team2} дээр тавихыг зөвлөж байна</div></div></div>}
                  <div style={{ marginBottom: 16 }}><SecTitle>Гол хүчин зүйлс</SecTitle>{result.key_factors?.map((f, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 14 }}><span style={{ color: "#a78bfa" }}>•</span><span style={{ color: "#cbd5e1" }}>{f}</span></div>)}</div>
                  <div style={{ background: "#1f2937", borderRadius: 10, padding: 14, marginBottom: 16 }}><SecTitle>Шинжилгээ</SecTitle><p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#cbd5e1" }}>{result.reasoning}</p></div>
                  <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: 14 }}><SecTitle style={{ color: "#60a5fa" }}>Зөвлөмж</SecTitle><p style={{ margin: 0, fontSize: 14, color: "#cbd5e1" }}>{result.recommendation}</p></div>
                </div>

                <div style={{ background: "#111827", borderRadius: 16, padding: 24, border: "1px solid #1f2937" }}>
                  <SecTitle>📐 Kelly Criterion — Хичнээн тавих вэ?</SecTitle>
                  <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>Математикийн оновчтой тооцоолол. Эрсдэлийг удирдахад тусална.</p>
                  <div style={{ marginBottom: 16 }}><Lbl>Нийт хөрөнгө (₮)</Lbl><Inp value={bankroll} onChange={setBankroll} placeholder="100,000" type="number" /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <KellyCard name={form.team1} odds={form.odds1} kelly={kelly1} br={br} color="#a78bfa" />
                    <KellyCard name={form.team2} odds={form.odds2} kelly={kelly2} br={br} color="#60a5fa" />
                  </div>
                  {br > 0 && result.value_bet !== "байхгүй" && (
                    <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, marginBottom: 8 }}>🎯 VALUE BET — ЗӨВЛӨМЖ</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <div><div style={{ color: "#94a3b8", fontSize: 12 }}>Full Kelly</div><div style={{ color: "#22c55e", fontWeight: 700, fontSize: 18 }}>₮{Math.round(bestKelly * br).toLocaleString()}</div></div>
                        <div><div style={{ color: "#94a3b8", fontSize: 12 }}>Half Kelly</div><div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 18 }}>₮{Math.round(bestKelly * 0.5 * br).toLocaleString()}</div></div>
                        <div><div style={{ color: "#94a3b8", fontSize: 12 }}>Хувь</div><div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 18 }}>{(bestKelly * 100).toFixed(1)}%</div></div>
                      </div>
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: "#374151", marginTop: 16, textAlign: "center" }}>⚠️ Зөвхөн AI шинжилгээ. Хариуцлагатайгаар бооцоо тавина уу.</p>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "history" && (
          <div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#374151" }}><div style={{ fontSize: 40, marginBottom: 12 }}>📋</div><p>Одоохондоо анализ хийгдээгүй байна</p></div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ color: "#64748b", fontSize: 13 }}>Нийт {history.length} анализ</span>
                  <button onClick={() => { setHistory([]); localStorage.removeItem("bets_history"); }} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>🗑 Цэвэрлэх</button>
                </div>
                {history.map(h => (
                  <div key={h.id} style={{ background: "#111827", borderRadius: 12, padding: 16, border: "1px solid #1f2937", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{h.date}</span>
                      <span style={{ fontSize: 12, color: "#a78bfa", background: "rgba(167,139,250,0.1)", padding: "2px 8px", borderRadius: 10 }}>{h.sport}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ textAlign: "center", flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: h.winner === h.team1 ? "#a78bfa" : "#e2e8f0" }}>{h.team1}</div><div style={{ fontSize: 12, color: "#64748b" }}>Одд: {h.odds1} | {h.probability1}%</div></div>
                      <div style={{ color: "#374151", fontWeight: 700, padding: "0 12px" }}>VS</div>
                      <div style={{ textAlign: "center", flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: h.winner === h.team2 ? "#60a5fa" : "#e2e8f0" }}>{h.team2}</div><div style={{ fontSize: 12, color: "#64748b" }}>Одд: {h.odds2} | {h.probability2}%</div></div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Tag color="#a78bfa">🏆 {h.winner}</Tag>
                      <Tag color={h.confidence === "өндөр" ? "#22c55e" : h.confidence === "дунд" ? "#f59e0b" : "#ef4444"}>Итгэлцэл: {h.confidence}</Tag>
                      {h.value_bet !== "байхгүй" && <Tag color="#22c55e">💰 Value</Tag>}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }`}</style>
      </div>
    </div>
  );
}

const Lbl = ({ children, style }) => <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, ...style }}>{children}</div>;
const SecTitle = ({ children, style }) => <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, ...style }}>{children}</div>;
const Inp = ({ value, onChange, placeholder, type = "text" }) => <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#e2e8f0", padding: "9px 12px", fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} />;
const ProbBar = ({ label, pct, color }) => <div style={{ marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ color: "#cbd5e1" }}>{label}</span><span style={{ color, fontWeight: 600 }}>{pct}%</span></div><div style={{ background: "#1f2937", borderRadius: 4, height: 6 }}><div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4, transition: "width 0.6s ease" }} /></div></div>;
const KellyCard = ({ name, odds, kelly, br, color }) => <div style={{ background: "#1f2937", borderRadius: 10, padding: 12, border: `1px solid ${kelly > 0 ? color + "33" : "#374151"}` }}><div style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div><div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Одд: {odds} | Kelly: {(kelly * 100).toFixed(1)}%</div>{kelly <= 0 ? <div style={{ fontSize: 13, color: "#4b5563" }}>Тавихгүй байхыг зөвлөнө</div> : br > 0 ? <><div style={{ fontSize: 13, color: "#94a3b8" }}>Full: <span style={{ color, fontWeight: 600 }}>₮{Math.round(kelly * br).toLocaleString()}</span></div><div style={{ fontSize: 13, color: "#94a3b8" }}>Half: <span style={{ color: "#f59e0b", fontWeight: 600 }}>₮{Math.round(kelly * 0.5 * br).toLocaleString()}</span></div></> : <div style={{ fontSize: 13, color: "#4b5563" }}>Хөрөнгө оруулна уу</div>}</div>;
const Tag = ({ children, color }) => <span style={{ fontSize: 11, color, background: color + "15", border: `1px solid ${color}33`, borderRadius: 8, padding: "3px 8px" }}>{children}</span>;
