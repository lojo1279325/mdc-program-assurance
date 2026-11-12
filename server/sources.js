const REGISTER_URL = "https://www.federalregister.gov/api/v1/documents.json";
const CSL_URL = "https://data.trade.gov/consolidated_screening_list/v1/search";
const SAYARI_TOKEN_URL = "https://api.sayari.com/oauth/token";
const SAYARI_SEARCH_URL = "https://api.sayari.com/v1/search/entity";

let sayariCache = { id: "", token: "", exp: 0 };

export function sourceStatus() {
  return {
    federalRegister: true,
    screeningList: Boolean(process.env.TRADE_GOV_API_KEY),
    sayari: Boolean(process.env.SAYARI_CLIENT_ID && process.env.SAYARI_CLIENT_SECRET),
  };
}

export function mapRegister(payload, observedAt) {
  const results = Array.isArray(payload?.results) ? payload.results.slice(0, 5) : [];
  if (!results.length) {
    return note("Federal Register", "no match", observedAt, "Federal Register returned no public notice for this name. This is a notice search, not a screening determination.");
  }
  const lines = results.map((item) => {
    const date = clip(item.publication_date, 20);
    const title = clip(item.title, 180);
    const url = clip(item.html_url, 300);
    return [date, title, url].filter(Boolean).join(". ");
  });
  return note("Federal Register", "matched", observedAt, `Federal Register returned ${results.length} public notice${results.length === 1 ? "" : "s"}. ${lines.join(" ")} This is a notice search, not a screening determination.`, {
    results: results.map((item) => ({
      title: clip(item.title, 180),
      date: clip(item.publication_date, 20),
      url: clip(item.html_url, 300),
      document: clip(item.document_number, 40),
    })),
  });
}

export function mapCsl(payload, observedAt) {
  const results = Array.isArray(payload?.results) ? payload.results.slice(0, 5) : [];
  if (!results.length) {
    return note("US Consolidated Screening List", "no match", observedAt, "The US Consolidated Screening List returned no active name match. A no match is not an approval.");
  }
  const lines = results.map((item) => {
    const name = clip(item.name, 160);
    const source = clip(item.source, 120);
    const programs = Array.isArray(item.programs) ? item.programs.slice(0, 3).map((program) => clip(program, 80)).join(", ") : "";
    return [name, source, programs].filter(Boolean).join(". ");
  });
  return note("US Consolidated Screening List", "matched", observedAt, `The US Consolidated Screening List returned ${results.length} active name match${results.length === 1 ? "" : "es"}. ${lines.join(" ")} A list match does not set the action or the risk band.`, {
    results: results.map((item) => ({
      name: clip(item.name, 160),
      source: clip(item.source, 120),
      programs: Array.isArray(item.programs) ? item.programs.slice(0, 4).map((program) => clip(program, 80)) : [],
    })),
  });
}

export function mapSayari(payload, observedAt) {
  const results = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.results) ? payload.results : [];
  const shown = results.slice(0, 5);
  if (!shown.length) {
    return note("Sayari", "no match", observedAt, "Sayari returned no entity match for this name. A no match is not an approval and does not change the risk band.");
  }
  const lines = shown.map((item) => {
    const label = clip(item.label || item.name, 160);
    const countries = Array.isArray(item.countries) ? item.countries.slice(0, 4).map((country) => clip(country, 8)).join(", ") : "";
    return [label, countries].filter(Boolean).join(". ");
  });
  return note("Sayari", "matched", observedAt, `Sayari returned ${shown.length} entity match${shown.length === 1 ? "" : "es"}. ${lines.join(" ")} A Sayari match is a source note. It does not set the action or the risk band.`, {
    results: shown.map((item) => ({
      id: clip(item.id, 80),
      label: clip(item.label || item.name, 160),
      countries: Array.isArray(item.countries) ? item.countries.slice(0, 6).map((country) => clip(country, 8)) : [],
    })),
  });
}

export async function lookupSources(input, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || fetch;
  const name = clip(input?.name, 200);
  const country = clip(input?.country, 80);
  const observedAt = new Date().toISOString();
  if (name.length < 2) {
    return { query: name, observedAt, results: [note("Sources", "unavailable", observedAt, "Enter at least two characters before checking sources.")] };
  }
  const [register, screening, sayari] = await Promise.all([
    lookupRegister(name, observedAt, fetchImpl),
    lookupCsl(name, observedAt, env, fetchImpl),
    lookupSayari(name, country, observedAt, env, fetchImpl),
  ]);
  return { query: name, country, observedAt, results: [register, screening, sayari] };
}

async function lookupRegister(name, observedAt, fetchImpl) {
  try {
    const url = `${REGISTER_URL}?conditions[term]=${encodeURIComponent(name)}&per_page=5&order=newest`;
    const payload = await readJson(fetchImpl, url, { headers: { accept: "application/json" } });
    return mapRegister(payload, observedAt);
  } catch {
    return note("Federal Register", "unavailable", observedAt, "Federal Register did not respond. Try the check again later. This does not change the review.");
  }
}

async function lookupCsl(name, observedAt, env, fetchImpl) {
  if (!env.TRADE_GOV_API_KEY) {
    return note("US Consolidated Screening List", "not connected", observedAt, "The US Consolidated Screening List search is not connected. Add the trade.gov subscription key to this environment. No list check was run.");
  }
  try {
    const url = `${CSL_URL}?name=${encodeURIComponent(name)}&fuzzy_name=true&size=5`;
    const payload = await readJson(fetchImpl, url, {
      headers: {
        accept: "application/json",
        "subscription-key": env.TRADE_GOV_API_KEY,
      },
    });
    return mapCsl(payload, observedAt);
  } catch {
    return note("US Consolidated Screening List", "unavailable", observedAt, "The screening list did not respond. No list result was saved as a match.");
  }
}

async function lookupSayari(name, country, observedAt, env, fetchImpl) {
  if (!env.SAYARI_CLIENT_ID || !env.SAYARI_CLIENT_SECRET) {
    return note("Sayari", "not connected", observedAt, "Sayari is not connected. Add the Sayari client id and client secret to this environment. No Sayari check was run.");
  }
  try {
    const token = await sayariToken(env, fetchImpl);
    const payload = await readJson(fetchImpl, `${SAYARI_SEARCH_URL}?limit=5`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ q: name }),
    });
    const mapped = mapSayari(payload, observedAt);
    if (country) mapped.summary = `Searched by name. Country context: ${country}. ${mapped.summary}`;
    return mapped;
  } catch {
    return note("Sayari", "unavailable", observedAt, "Sayari did not return a result. Check the credentials and try again. No match was inferred.");
  }
}

async function sayariToken(env, fetchImpl) {
  if (sayariCache.id === env.SAYARI_CLIENT_ID && sayariCache.token && sayariCache.exp > Date.now() + 60000) return sayariCache.token;
  const response = await fetchImpl(SAYARI_TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.SAYARI_CLIENT_ID,
      client_secret: env.SAYARI_CLIENT_SECRET,
      audience: "sayari.com",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("token");
  const payload = await response.json();
  if (!payload?.access_token) throw new Error("token");
  sayariCache = {
    id: env.SAYARI_CLIENT_ID,
    token: payload.access_token,
    exp: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  return sayariCache.token;
}

async function readJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, { ...init, signal: init.signal || AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

function note(source, status, observedAt, summary, payload = {}) {
  return {
    source,
    status,
    observedAt,
    summary: clip(summary, 1200),
    payload,
  };
}

function clip(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
