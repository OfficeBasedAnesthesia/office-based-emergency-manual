const protocols = window.protocols || [];

const app = document.querySelector("#app");
const navButtons = [...document.querySelectorAll(".top-nav button")];

const state = {
  route: "home",
  selectedCategory: "critical-events",
  selectedProtocolId: protocols.find((p) => p.id === "allergies-anaphylaxis")?.id ?? protocols[0]?.id ?? "",
  homeQuery: "",
  searchQuery: ""
};

function syncHash() {
  const params = new URLSearchParams();
  params.set("route", state.route);
  if (state.selectedCategory) params.set("category", state.selectedCategory);
  if (state.selectedProtocolId) params.set("case", state.selectedProtocolId);
  if (state.homeQuery) params.set("homeQuery", state.homeQuery);
  if (state.searchQuery) params.set("searchQuery", state.searchQuery);
  history.replaceState(null, "", `#${params.toString()}`);
}

function loadHash() {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return;
  const params = new URLSearchParams(raw);
  const route = params.get("route");
  if (route && ["home", "categories", "search", "manual"].includes(route)) state.route = route;
  const category = params.get("category");
  if (category && protocols.some((protocol) => protocol.category === category)) state.selectedCategory = category;
  const selectedCase = params.get("case");
  if (selectedCase && protocols.some((protocol) => protocol.id === selectedCase)) state.selectedProtocolId = selectedCase;
  state.homeQuery = params.get("homeQuery") || "";
  state.searchQuery = params.get("searchQuery") || "";
}

const stopWords = new Set([
  "a","an","and","the","is","are","was","were","be","been","being","just","there","someone","somebody","patient","has","have","had","with","in","on","of","to","for","from","at","it"
]);

const phraseSignals = [
  { patterns: ["patient just desaturated", "patient desaturated", "desaturated", "desat", "oxygen dropping"], expansions: ["hypoxia", "desaturation", "low oxygen"] },
  { patterns: ["patient is bleeding", "bleeding", "blood loss", "hemorrhaging"], expansions: ["hemorrhage", "bleeding", "blood loss"] },
  { patterns: ["fire in the building", "there is a fire", "building fire", "smoke in building", "fire"], expansions: ["fire", "evacuation", "building fire", "emergency preparedness"] },
  { patterns: ["someone has a knife", "knife", "weapon", "gun", "active shooter", "threat"], expansions: ["workplace violence", "weapon", "active threat", "security"] },
  { patterns: ["cant ventilate", "can't ventilate", "cant intubate", "can't intubate", "airway obstruction"], expansions: ["difficult airway", "airway obstruction"] },
  { patterns: ["rash", "hives", "swelling", "allergic reaction", "anaphylaxis"], expansions: ["anaphylaxis", "allergy", "rash", "urticaria"] },
  { patterns: ["patient is cold", "cold patient", "cold", "hypothermic", "low temperature"], expansions: ["hypothermia", "temperature abnormal", "cold patient"] }
];

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stemTerm(term) {
  const stems = {
    desaturated: "desaturation",
    desatting: "desaturation",
    bleeding: "bleed",
    hemorrhaging: "hemorrhage",
    aspirated: "aspiration",
    stabbing: "stab",
    shooter: "shoot",
    hypothermic: "hypothermia"
  };
  return stems[term] || term;
}

function expandQuery(query) {
  const normalized = normalizeText(query);
  const tokens = normalized.split(" ").filter(Boolean).filter((t) => !stopWords.has(t)).map(stemTerm);
  const expansions = new Set([normalized, ...tokens]);
  for (const signal of phraseSignals) {
    if (signal.patterns.some((pattern) => normalized.includes(normalizeText(pattern)))) {
      for (const expansion of signal.expansions) {
        expansions.add(normalizeText(expansion));
        for (const token of normalizeText(expansion).split(" ").filter(Boolean)) expansions.add(stemTerm(token));
      }
    }
  }
  return [...expansions].filter(Boolean);
}

function titleCaseCategory(category) {
  switch (category) {
    case "critical-events": return "Critical Events";
    case "acls": return "ACLS";
    case "pals": return "PALS";
    case "emergency": return "Emergency";
    case "administrative": return "Administrative";
    default: return category;
  }
}

function categoryColor(category) {
  return {
    "critical-events": "#c24b44",
    emergency: "#ce7b2f",
    acls: "#245f8f",
    pals: "#2f7a68",
    administrative: "#6f5a92"
  }[category] || "#6d7f8f";
}

function buildSearchText(protocol) {
  return [
    protocol.title,
    protocol.summary,
    ...protocol.tags,
    ...protocol.whenToSuspect,
    ...protocol.immediateActions,
    ...protocol.airway,
    ...protocol.monitoring,
    ...protocol.escalation,
    ...protocol.pearls,
    ...protocol.rawChecklist,
    ...(protocol.searchAliases || [])
  ].join(" ").toLowerCase();
}

function rankProtocols(items, query) {
  const normalized = normalizeText(query);
  if (!normalized) return items;
  const expandedTerms = expandQuery(normalized);
  const baseTerms = normalizeText(normalized).split(" ").filter(Boolean).map(stemTerm);

  return [...items]
    .map((protocol) => {
      const haystack = buildSearchText(protocol);
      let score = 0;

      for (const term of expandedTerms) {
        if (normalizeText(protocol.title).includes(term)) score += 10;
        if (protocol.tags.some((tag) => normalizeText(tag).includes(term))) score += 7;
        if ((protocol.searchAliases || []).some((alias) => normalizeText(alias).includes(term))) score += 8;
        if (haystack.includes(term)) score += 3;
      }

      if (haystack.includes(normalized)) score += 10;
      if (baseTerms.every((term) => haystack.includes(term))) score += 8;

      return { protocol, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.protocol.title.localeCompare(b.protocol.title))
    .map((entry) => entry.protocol);
}

function getSectionTone(title) {
  const normalized = title.toLowerCase();
  if (normalized === "start" || normalized === "immediate actions") return "start";
  if (normalized === "medications" || normalized.startsWith("drug doses")) return "drug";
  if (normalized.startsWith("critical changes")) return "critical";
  if (normalized.includes("defibrillator") || normalized.includes("cardioversion") || normalized.includes("pacing")) return "technical";
  if (normalized.startsWith("during ") || normalized === "escalation / transfer" || normalized === "source") return "operational";
  if (normalized === "when to suspect" || normalized === "monitoring" || normalized.startsWith("common causes") || normalized.startsWith("differential") || normalized.startsWith("hs and ts") || normalized.startsWith("triggering agents") || normalized.startsWith("airway management")) return "reference";
  return "default";
}

function selectedProtocol() {
  return protocols.find((protocol) => protocol.id === state.selectedProtocolId) || protocols[0];
}

function sectionCard(title, body, tone = getSectionTone(title)) {
  return `
    <section class="section-card section-${tone}">
      <div class="section-header">${escapeHtml(title)}</div>
      <div class="section-body">${body}</div>
    </section>
  `;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fallbackChecklist(items) {
  return `
    <div class="list-block">
      ${items.map((item) => {
        const isPrimary = /^\d+\s/.test(item.trim());
        const isIndent = /^(Ask:|Say:|Call:|If |Perform |Defibrillate|Give |Consider |Assess |Check |Treat |Resume |Shock |Place |Turn |Open |Secure |Monitor |Arrange |Collect |Notify )/i.test(item.trim()) && !isPrimary;
        return `
          <div class="check-row ${isPrimary ? "primary" : ""} ${isIndent ? "indent" : ""}">
            <div class="dot">•</div>
            <div class="text">${escapeHtml(item)}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function splitLabelValue(item) {
  const match = item.match(/^([^:]+):\s*(.+)$/);
  return match ? { label: match[1].trim(), value: match[2].trim() } : null;
}

function drugSection(section) {
  const rows = (items) => `
    <div class="drug-table">
      ${items.map((item) => {
        const pair = splitLabelValue(item);
        if (pair) {
          return `<div class="drug-row"><div class="drug-label">${escapeHtml(pair.label)}:</div><div class="drug-value">${escapeHtml(pair.value)}</div></div>`;
        }
        return `<div class="drug-row"><div class="drug-value" style="grid-column:1 / -1">${escapeHtml(item)}</div></div>`;
      }).join("")}
    </div>
  `;

  return `
    <section class="section-card section-drug">
      <div class="section-header">${escapeHtml(section.title)}</div>
      <div class="section-body">
        ${rows(section.items)}
        ${(section.subSections || []).map((subSection) => `
          <div class="subsection">
            <h4 class="subsection-title">${escapeHtml(subSection.title)}</h4>
            ${rows(subSection.items)}
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function normalizeDrugItem(item) {
  return item
    .replace(/^Diphenhydramine\s*(?=\d)/, "Diphenhydramine: ")
    .replace(/^H2 Blockers\s+/, "H2 Blockers: ")
    .replace(/^Hydrocortisone\s+/, "Hydrocortisone: ")
    .replace(/^Famotidine\s+/, "Famotidine: ")
    .replace(/^Methylprednisolone\s+/, "Methylprednisolone: ");
}

function drugRowsForSlide(items) {
  const grouped = [];
  items.forEach((item) => {
    const normalized = normalizeDrugItem(item);
    const pair = splitLabelValue(normalized);
    if (pair) {
      if (pair.label.toLowerCase() === "famotidine" && grouped.at(-1)?.label?.toLowerCase() === "h2 blockers") {
        grouped.at(-1).values.push(`Famotidine ${pair.value}`);
        return;
      }
      grouped.push({ label: pair.label, values: [pair.value] });
      return;
    }

    if (/^Infusion\b/i.test(normalized) && grouped.at(-1)?.label?.toLowerCase() === "epinephrine") {
      grouped.at(-1).values.push(normalized);
      return;
    }

    grouped.push({ label: "", values: [normalized] });
  });

  return grouped.map((row) => row.label
    ? `<div class="drug-row"><div class="drug-label">${escapeHtml(row.label)}:</div><div class="drug-value">${row.values.map((value) => `<div class="drug-option">${escapeHtml(value)}</div>`).join("")}</div></div>`
    : `<div class="drug-row"><div class="drug-value" style="grid-column:1 / -1">${escapeHtml(row.values[0])}</div></div>`
  ).join("");
}

function renderSlideChecklist(items, formatText = escapeHtml) {
  const additionalConsiderationsIndex = items.findIndex((item) => /^\d+\s+Additional Considerations/i.test(item));
  const startItems = additionalConsiderationsIndex === -1 ? items : items.slice(0, additionalConsiderationsIndex);
  const additionalItems = additionalConsiderationsIndex === -1 ? [] : items.slice(additionalConsiderationsIndex + 1);

  return `
    <div class="anaphylaxis-checklist">
      ${startItems.map((item) => {
        const trimmed = item.trim();
        const alternative = trimmed.match(/^--\s*or\s*--\s*(.+)$/i);
        if (alternative) {
          return `
            <div class="alternative-divider">-- or --</div>
            <div class="anaphylaxis-line detail">${formatText(alternative[1])}</div>
          `;
        }
        const fluidBolus = trimmed.match(/^4\s+(.+?)\s+ADULTS:\s*(.+?)\s+PEDS:\s*(.+)$/i);
        if (fluidBolus) {
          return `
            <div class="anaphylaxis-line primary fluid-bolus-step">
              <div>4 ${escapeHtml(fluidBolus[1])}</div>
              <div class="fluid-dose"><b>ADULTS:</b> ${escapeHtml(fluidBolus[2])}</div>
              <div class="fluid-dose"><b>PEDS:</b> ${escapeHtml(fluidBolus[3])}</div>
            </div>
          `;
        }
        const isPrimary = /^\d+\s/.test(trimmed) && !/^10 breaths\/min/i.test(trimmed);
        const isPrompt = /^(Ask:|Say:|Call:|If |Perform |Defibrillate|Give |Consider |Assess |Check |Treat |Resume |Shock |Place |Turn |Open |Secure |Monitor |Arrange |Collect |Notify )/i.test(trimmed) && !isPrimary;
        const isDetail = !isPrimary && !isPrompt;
        return `
          <div class="anaphylaxis-line ${isPrimary ? "primary" : ""} ${isPrompt ? "prompt" : ""} ${isDetail ? "detail" : ""}">
            ${formatText(trimmed)}
          </div>
        `;
      }).join("")}
      ${additionalItems.length ? `
        <div class="anaphylaxis-subhead">Additional Considerations</div>
        ${additionalItems.map((item) => `<div class="anaphylaxis-line prompt">${formatText(item)}</div>`).join("")}
      ` : ""}
    </div>
  `;
}

function renderSlideSection(section, protocolId = "") {
  const tone = getSectionTone(section.title);
  const extraClass =
    tone === "drug" ? "anaphylaxis-drug-card" :
    /PEDS/i.test(section.title) ? "anaphylaxis-peds-card" :
    section.title === "Common causes" ? "anaphylaxis-causes-card" :
    section.title === "Critical CHANGES" ? "anaphylaxis-critical-card" :
    "";

  if (protocolId === "acls-tachycardia-unstable" && section.title === "Critical CHANGES") {
    return `
      <section class="anaphylaxis-critical tachy-critical-card">
        <div class="anaphylaxis-critical-header">Critical CHANGES</div>
        <div class="tachy-critical-body">
          <p>If cardioversion required but unable to synchronize shock, use<br>HIGH-ENERGY unsynchronized shocks</p>
          <h4>If cardiac arrest:</h4>
          <div class="tachy-arrest-row"><b>VF/VT</b><span>Go to <button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-vf-vt">CHKLST 1-VF/VT</button></span></div>
          <div class="tachy-arrest-row"><b>Asystole/PEA</b><span>Go to <button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-asystole-pea">CHKLST 2-Asystole/PEA</button></span></div>
        </div>
      </section>
    `;
  }

  if (protocolId === "acls-tachycardia-unstable" && section.title === "During resuscitation") {
    return `
      <section class="section-card tachy-during-card">
        <div class="section-header">During resuscitation</div>
        <div class="tachy-during-body">
          <b>Airway:</b><span>Assess and secure</span>
          <b>Circulation:</b><span>Confirm adequate IV/IO access<br>Consider IV fluids wide open</span>
          <b>Assign roles:</b><span>Airway, Vascular access, Timing, Code cart, documentation</span>
        </div>
      </section>
    `;
  }

  if (protocolId === "acls-cardiac-arrest-asystole-pea" && tone === "drug") {
    const toxin = section.subSections?.find((item) => item.title === "TOXIN Treatments");
    const hyperkalemia = section.subSections?.find((item) => item.title === "HYPERKALEMIA treatment");
    return `
      <section class="section-card section-drug anaphylaxis-drug-card asystole-drug-table">
        <div class="section-header">${escapeHtml(section.title)}</div>
        <div class="asystole-drug-body">
          <div class="asystole-drug-row"><b>Epinephrine:</b><span>1mg IV, repeat every 3-5 min</span></div>
          <div class="asystole-drug-group">
            <h4>${escapeHtml(toxin?.title || "TOXIN Treatments")}</h4>
            <div class="asystole-drug-row"><b>Local Anesthetic</b><span>Intralipid 1.5ml/kg bolus, repeat for persistent asystole<br><span class="asystole-indent">Start 0.25-0.5ml/kg/min; 30-60min if refractory hypotension</span></span></div>
            <div class="asystole-drug-row"><b>Beta-blocker</b><span>Glucagon 2-4mg IV push</span></div>
            <div class="asystole-drug-row"><b>Ca chan blocker</b><span>Ca chloride 1g IV push</span></div>
          </div>
          <div class="asystole-drug-row separated"><b>Bicarbonate</b><span>1-2mEq/kg, slow IV push; max 50mEq</span></div>
          <div class="asystole-drug-group">
            <h4>${escapeHtml(hyperkalemia?.title || "HYPERKALEMIA treatment")}</h4>
            <div class="asystole-drug-row"><b>1. Ca gluconate</b><span>30mg/kg IV, max 3000mg</span></div>
            <div class="asystole-drug-row"><b class="asystole-or">--- or ---<br>Ca chloride</b><span><br>10mg/kg IV, max 2000mg</span></div>
          </div>
          <div class="asystole-drug-row separated"><b>2. Insulin</b><span>10 units regular IV with 1-2 amps D50W</span></div>
        </div>
      </section>
    `;
  }

  if (protocolId === "acls-cardiac-arrest-asystole-pea" && section.title === "During CPR") {
    return `
      <section class="section-card asystole-during-card">
        <div class="section-header">During CPR</div>
        <div class="asystole-during-body">
          <b>Airway:</b><span>Bag-mask sufficient (if ventilation adequate)</span>
          <b>Circulation:</b><span>Confirm adequate IV/IO access<br>Consider IV fluids wide open<br>Consider ECMO for select potentially reversible causes</span>
          <b>Assign roles:</b><span>Chest compression, Airway, Vascular access, Timing,</span>
          <b>Code</b><span>cart, documentation</span>
        </div>
      </section>
    `;
  }

  if (protocolId === "acls-bradycardia-unstable" && section.title === "During resuscitation") {
    return `
      <section class="section-card brady-during-card">
        <div class="section-header">During resuscitation</div>
        <div class="brady-during-body">
          <b>Airway:</b><span>Assess and secure</span>
          <b>Circulation:</b><span>Confirm adequate IV/IO access<br>Consider IV fluids wide open</span>
          <b>Assign roles:</b><span>Airway, Vascular access, Timing,<br>Code cart, documentation</span>
        </div>
      </section>
    `;
  }

  if (tone === "drug") {
    return `
      <section class="section-card section-${tone} ${extraClass}">
        <div class="section-header">${escapeHtml(section.title)}</div>
        <div class="section-body">
          <div class="drug-table">
            ${drugRowsForSlide(section.items)}
          </div>
          ${(section.subSections || []).map((subSection) => `
            <div class="subsection">
              <h4 class="subsection-title">${escapeHtml(subSection.title)}</h4>
              <div class="drug-table">
                ${drugRowsForSlide(subSection.items)}
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  if (section.title === "BIPHASIC CARDIOVERSION energy levels") {
    const rows = section.items.slice(1).map((item) => {
      const match = item.match(/^(Narrow complex, regular|Narrow complex, irregular|Wide complex, regular|Wide complex, irregular)\s+(.+)$/i);
      return match ? [match[1], match[2]] : [item, ""];
    });
    return `
      <section class="section-card tachy-energy-card">
        <div class="section-header">${escapeHtml(section.title)}</div>
        <div class="tachy-energy-table">
          <div class="tachy-energy-heading">CONDITION</div><div class="tachy-energy-heading">ENERGY LEVEL -&gt; PROGRESSION</div>
          ${rows.map(([condition, energy]) => `<div>${escapeHtml(condition)}</div><div>${linkifyChecklistReferences(energy)}</div>`).join("")}
        </div>
      </section>
    `;
  }

  if (section.title === "Critical CHANGES") {
    const adultArrest = section.items.find((item) => /^If cardiac arrest ADULT/i.test(item));
    const pedsArrest = section.items.find((item) => /^If cardiac arrest PEDS/i.test(item));
    const remaining = section.items.filter((item) => item !== adultArrest && item !== pedsArrest);
    if (adultArrest && pedsArrest) {
      return `
        <section class="anaphylaxis-critical arrest-critical-table">
          <div class="anaphylaxis-critical-header">${escapeHtml(section.title)}</div>
          <div class="arrest-critical-grid">
            <div>
              <h4>If cardiac arrest <strong>ADULT</strong></h4>
              <div class="arrest-row"><span>VF/VT</span><b>Go to <button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-vf-vt">CHKLST 1-VF/VT</button></b></div>
              <div class="arrest-row"><span>Asystole/PEA</span><b>Go to <button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-asystole-pea">CHKLST 2-Asystole/PEA</button></b></div>
            </div>
            <div>
              <h4>If cardiac arrest <strong>PEDS:</strong></h4>
              <div class="arrest-row"><span>VF/VT</span><b>Go to <button class="manual-case-link" type="button" data-open-protocol="pals-cardiac-arrest-vf-vt">CHKLST 5-VF/VT</button></b></div>
              <div class="arrest-row"><span>Asystole/PEA</span><b>Go to <button class="manual-case-link" type="button" data-open-protocol="pals-cardiac-arrest-asystole-pea">CHKLST 6-Asystole/PEA</button></b></div>
            </div>
          </div>
          ${remaining.length ? `<div class="critical-symptoms">${remaining.map(escapeHtml).join("<br>")}</div>` : ""}
        </section>
      `;
    }
    return `
      <section class="anaphylaxis-critical">
        <div class="anaphylaxis-critical-header">${escapeHtml(section.title)}</div>
        <div class="anaphylaxis-critical-body single">
          <div class="anaphylaxis-critical-col">
            ${section.items.map((item) => `<div>${linkifyChecklistReferences(item)}</div>`).join("")}
          </div>
        </div>
      </section>
    `;
  }

  if (section.title === "CIED technical support numbers") {
    const rows = [];
    for (let index = 0; index < section.items.length; index += 2) {
      rows.push([section.items[index], section.items[index + 1] || ""]);
    }
    return `
      <section class="section-card cied-support-table">
        <div class="section-header">${escapeHtml(section.title)}</div>
        <div class="cied-support-body">
          ${rows.map(([company, phone]) => `<div class="cied-support-row"><span>${escapeHtml(company)}</span><b>${escapeHtml(phone)}</b></div>`).join("")}
        </div>
      </section>
    `;
  }

  if (/^Hs and Ts/i.test(section.title)) {
    const splitAt = Math.ceil(section.items.length / 2);
    return `
      <section class="section-card section-reference anaphylaxis-reference-table">
        <div class="section-header">${escapeHtml(section.title)}</div>
        <div class="section-body two-column-reference">
          <div>${section.items.slice(0, splitAt).map((item) => `<div>${escapeHtml(item)}</div>`).join("")}</div>
          <div>${section.items.slice(splitAt).map((item) => `<div>${escapeHtml(item)}</div>`).join("")}</div>
        </div>
      </section>
    `;
  }

  const labelPairs = section.items.map(splitLabelValue);
  const useLabelGrid = labelPairs.filter(Boolean).length >= Math.max(2, Math.ceil(section.items.length / 2));

  return `
    <section class="section-card section-${tone} ${extraClass}">
      <div class="section-header">${escapeHtml(section.title)}</div>
      <div class="section-body">
        <div class="list-block ${useLabelGrid ? "manual-label-grid" : ""}">
          ${section.items.map((item, index) => {
            const pair = labelPairs[index];
            return pair
              ? `<div class="manual-label-row"><b>${escapeHtml(pair.label)}:</b><span>${escapeHtml(pair.value)}</span></div>`
              : `<div class="anaphylaxis-cause-item">${escapeHtml(item)}</div>`;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function isInlineSlideSection(title) {
  return ["Differential", "Differential Diagnosis"].includes(title);
}

function renderSlideInlineSection(section) {
  if (/^TRANSCUTANEOUS pacing instructions$/i.test(section.title)) {
    const numberedItems = section.items.slice(0, 7);
    const captureDetails = section.items.slice(7);
    return `
      <section class="section-card brady-pacing-box">
        <div class="section-header">${escapeHtml(section.title)}</div>
        <div class="brady-pacing-body">
          ${numberedItems.map((item, index) => `
            <div class="brady-pacing-row"><b>${index + 1}.</b><span>${escapeHtml(item)}</span></div>
          `).join("")}
          <div class="brady-capture-details">
            ${captureDetails.map((item) => {
              const pair = splitLabelValue(item);
              return pair ? `<div><b>${escapeHtml(pair.label)}:</b> ${escapeHtml(pair.value)}</div>` : `<div>${escapeHtml(item)}</div>`;
            }).join("")}
          </div>
        </div>
      </section>
    `;
  }
  return `
    <section class="slide-inline-section">
      <h3>${escapeHtml(section.title)}</h3>
      <div class="list-block">
        ${section.items.map((item) => `<div class="anaphylaxis-cause-item">${escapeHtml(item)}</div>`).join("")}
      </div>
    </section>
  `;
}

function getPrimarySlideSection(rawSections) {
  return rawSections.find((section) => ["Checklist", "CAB Protocol", "ABC Assessment"].includes(section.title))
    || rawSections[0];
}

function getSlideBadgeLabel(title) {
  if (title === "Checklist") return "START";
  return title;
}

function getManualSectionLabel(protocol) {
  return {
    acls: "ACLS",
    pals: "PALS",
    emergency: "EMERGENCY",
    "critical-events": "CRITICAL EVENTS",
    administrative: "ADMINISTRATIVE"
  }[protocol.category] || titleCaseCategory(protocol.category).toUpperCase();
}

function getPopulationLabel(protocol) {
  if (protocol.population === "adult") return "Adult";
  if (protocol.population === "pediatric") return "Pediatric";
  if (protocol.population === "mixed") return "Adult + Pediatric";
  return protocol.population;
}

function renderSlideCase(protocol) {
  const isAsystole = protocol.id === "acls-cardiac-arrest-asystole-pea";
  const isBradycardia = protocol.id === "acls-bradycardia-unstable";
  const isTachycardia = protocol.id === "acls-tachycardia-unstable";
  const usesReferenceLayout = isBradycardia || isTachycardia;
  const primarySection = getPrimarySlideSection(protocol.rawSections);
  const criticalChanges = protocol.rawSections.find((section) => section.title === "Critical CHANGES");
  const supportingSections = protocol.rawSections.filter((section) => section !== primarySection && (usesReferenceLayout || section !== criticalChanges));
  const inlineSections = supportingSections.filter((section) => isInlineSlideSection(section.title) || (isBradycardia && /^TRANSCUTANEOUS/i.test(section.title)));
  let rightSections = supportingSections.filter((section) => !inlineSections.includes(section));
  if (usesReferenceLayout) {
    const panelOrder = isBradycardia
      ? ["DRUG DOSES and treatments ADULT", "Critical CHANGES", "During resuscitation"]
      : ["BIPHASIC CARDIOVERSION energy levels", "Critical CHANGES", "During resuscitation"];
    rightSections = rightSections.sort((a, b) => panelOrder.indexOf(a.title) - panelOrder.indexOf(b.title));
  }
  const suspectLine = protocol.whenToSuspect[0] || protocol.summary;

  return `
    <section class="anaphylaxis-sheet ${isAsystole ? "asystole-sheet" : ""} ${isBradycardia ? "bradycardia-sheet" : ""} ${isTachycardia ? "tachycardia-sheet" : ""}">
      <div class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          ${isAsystole ? `
            <div class="asystole-title-row">
              <span class="asystole-slide-number">2</span>
              <h2>${escapeHtml(protocol.title)}</h2>
              <div class="asystole-rhythm-strips" aria-label="Asystole and PEA rhythm examples">
                <div class="rhythm-strip"><b>Asystole</b><span class="flat-rhythm"></span></div>
                <div class="rhythm-strip"><b>PEA</b><svg viewBox="0 0 150 38" role="img" aria-label="PEA rhythm"><polyline points="0,23 8,22 13,10 18,31 24,20 31,22 37,13 43,29 49,19 56,22 62,12 68,30 74,19 81,22 87,13 93,29 99,19 106,22 112,12 118,30 124,19 132,22 138,14 145,27 150,21" /></svg></div>
              </div>
            </div>
          ` : `
            <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
            <h2>${escapeHtml(protocol.title)}</h2>
          `}
          <p>${escapeHtml(suspectLine)}</p>
        </div>
      </div>

      <div class="anaphylaxis-grid ${rightSections.length ? "" : "no-side"}">
        <div class="anaphylaxis-main">
          <div class="anaphylaxis-start-badge">${escapeHtml(getSlideBadgeLabel(primarySection.title))}</div>
          <div class="anaphylaxis-main-box">
            ${isAsystole
              ? renderAsystoleChecklist()
              : isTachycardia
              ? renderTachycardiaChecklist(primarySection.items)
              : renderSlideChecklist(primarySection.items, isAsystole ? linkifyAsystoleChecklist : escapeHtml)}
          </div>
          ${inlineSections.map((section) => renderSlideInlineSection(section)).join("")}
          ${criticalChanges && !usesReferenceLayout ? renderSlideSection(criticalChanges, protocol.id) : ""}
        </div>

        <div class="anaphylaxis-side">
          ${rightSections.map((section) => renderSlideSection(section, protocol.id)).join("")}
        </div>
      </div>
    </section>
  `;
}

function linkifyAsystoleChecklist(text) {
  const label = "CHKLST 1-VF/VT";
  const html = escapeHtml(text);
  return html.replace(label, `<button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-vf-vt">${label}</button>`);
}

function renderAsystoleChecklist() {
  return `
    <div class="asystole-checklist">
      <div class="anaphylaxis-line primary">1 Call for help and a code cart</div>
      <div class="anaphylaxis-line prompt">Ask: “Who will be the crisis manager”?</div>
      <div class="anaphylaxis-line prompt">Say: “High quality CPR”</div>
      <div class="anaphylaxis-line prompt">Call: “Initiate Transfer Protocol”</div>
      <div class="anaphylaxis-line primary">2 Put backboard under patient, supine</div>
      <div class="anaphylaxis-line primary">3 Turn FiO2 to 100%, turn off volatile anesthetics</div>
      <div class="anaphylaxis-line primary">4 Start CPR and assessment cycle</div>

      <div class="asystole-action">Perform CPR</div>
      <div class="asystole-bullet">“Hard and fast” 100-120 compressions/min to depth of 2-2.3 inches</div>
      <div class="asystole-bullet">Ensure full chest recoil with minimal interruptions</div>
      <div class="asystole-bullet">10 breaths/min, do not over-ventilate</div>

      <div class="asystole-action">Give epinephrine</div>
      <div class="asystole-bullet">Repeat epinephrine every 3-5 min</div>

      <div class="asystole-action">Assess every 2 minutes</div>
      <div class="asystole-bullet">Change CPR compression provider</div>
      <div class="asystole-bullet">Check ETCO2</div>
      <div class="asystole-deep">If &lt;10mmHg: evaluate CPR technique</div>
      <div class="asystole-deep">If suddenly &gt;40mmHg: may indicate ROSC</div>
      <div class="asystole-bullet">Check rhythm; if rhythm organized, check pulse</div>
      <div class="asystole-deep">If asystole/PEA continues:</div>
      <div class="asystole-hollow">Resume CPR and assessment cycle (restart Step 4)</div>
      <div class="asystole-hollow">Read aloud Hs and Ts</div>
      <div class="asystole-deep">If VF/VT:</div>
      <div class="asystole-hollow">Resume CPR</div>
      <div class="asystole-hollow">Go to <button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-vf-vt">CHKLST 1-VF/VT</button></div>
    </div>
  `;
}

function linkifyChecklistReferences(text) {
  const targets = {
    "CHKLST 1-VF/VT": "acls-cardiac-arrest-vf-vt",
    "CHKLST 2-Asystole/PEA": "acls-cardiac-arrest-asystole-pea",
    "CHKLST 3-Asystole/PEA": "acls-cardiac-arrest-asystole-pea",
    "CHKLST 5-VF/VT": "pals-cardiac-arrest-vf-vt",
    "CHKLST 6-Asystole/PEA": "pals-cardiac-arrest-asystole-pea"
  };
  let html = escapeHtml(text);
  Object.entries(targets).forEach(([label, target]) => {
    html = html.replace(label, `<button class="manual-case-link" type="button" data-open-protocol="${target}">${label}</button>`);
  });
  return html;
}

function renderTachycardiaChecklist(items) {
  const additionalIndex = items.findIndex((item) => /^6\s+Additional Considerations/i.test(item));
  const mainItems = items.slice(0, additionalIndex);
  const additionalItems = items.slice(additionalIndex + 1);
  let activeStep = 0;
  let nestedNumber = 0;
  return `
    <div class="anaphylaxis-checklist tachy-checklist">
      ${mainItems.map((item) => {
        const trimmed = item.trim();
        const stepMatch = trimmed.match(/^(\d+)\s/);
        if (stepMatch) {
          activeStep = Number(stepMatch[1]);
          nestedNumber = 0;
          return `<div class="anaphylaxis-line primary">${linkifyChecklistReferences(trimmed)}</div>`;
        }
        if (activeStep === 4 || activeStep === 5) {
          nestedNumber += 1;
          return `<div class="tachy-numbered-detail"><b>${nestedNumber}.</b><span>${linkifyChecklistReferences(trimmed)}</span></div>`;
        }
        return `<div class="anaphylaxis-line prompt">${linkifyChecklistReferences(trimmed)}</div>`;
      }).join("")}
      <div class="anaphylaxis-subhead">6 Additional Considerations</div>
      ${additionalItems.map((item) => `<div class="anaphylaxis-line prompt">${linkifyChecklistReferences(item)}</div>`).join("")}
    </div>
  `;
}

function renderProtocolCard(protocol) {
  return `
    <article class="protocol-card" data-open-protocol="${protocol.id}">
      <span class="category-chip" style="background:${categoryColor(protocol.category)}">${escapeHtml(titleCaseCategory(protocol.category))}</span>
      <h3>${escapeHtml(protocol.title)}</h3>
      <p class="muted">${escapeHtml(protocol.summary)}</p>
      ${protocol.callEms ? `<div class="flag">EMS / transfer likely needed</div>` : ""}
    </article>
  `;
}

function bindProtocolCards(scope = app) {
  scope.querySelectorAll("[data-open-protocol]").forEach((element) => {
    element.addEventListener("click", () => {
      state.selectedProtocolId = element.dataset.openProtocol;
      const protocol = selectedProtocol();
      state.selectedCategory = protocol.category;
      state.route = "categories";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderHomeResults() {
  const matches = state.homeQuery
    ? rankProtocols(protocols, state.homeQuery).slice(0, 8)
    : protocols.filter((p) => ["allergies-anaphylaxis","hypoxia","last-adult-ped-dosing","mh-adult-ped-dosing","difficult-airway"].includes(p.id));
  const title = state.homeQuery ? "Best Matches" : "Priority Cases";
  const container = document.querySelector("#home-results");
  if (!container) return;
  container.innerHTML = `
    <h2>${title}</h2>
    <div class="protocol-grid">${matches.map(renderProtocolCard).join("")}</div>
  `;
  bindProtocolCards(container);
}

function renderSearchResults() {
  const matches = state.searchQuery ? rankProtocols(protocols, state.searchQuery) : protocols;
  const container = document.querySelector("#search-results");
  if (!container) return;
  container.innerHTML = `<div class="protocol-grid">${matches.map(renderProtocolCard).join("")}</div>`;
  bindProtocolCards(container);
}

function renderHome() {
  app.innerHTML = `
    <div class="page-stack home-page">
      <section class="card home-panel" id="home-results">
      </section>

      <section class="card home-panel">
        <h2>Browse Categories</h2>
        <div class="category-grid">
          ${["critical-events","acls","pals","emergency","administrative"].map((category) => `
            <article class="category-card" data-open-category="${category}">
              <h3>${escapeHtml(titleCaseCategory(category))}</h3>
              <p class="muted">${protocols.filter((protocol) => protocol.category === category).length} protocols</p>
            </article>
          `).join("")}
        </div>
      </section>
    </div>
  `;

  renderHomeResults();
}

function renderCategories() {
  const categoryProtocols = protocols.filter((protocol) => protocol.category === state.selectedCategory);
  const isVfVt = state.selectedProtocolId === "acls-cardiac-arrest-vf-vt";
  const isWideManual = isVfVt || state.selectedProtocolId === "difficult-airway";
  app.innerHTML = `
    <div class="page-columns manual-detail-page ${isWideManual ? "wide-manual-page" : ""} ${isVfVt ? "vfvt-page" : ""}">
      <aside class="sidebar-stack">
        <section class="card">
          <h2>Categories</h2>
          <div class="pill-wrap">
            ${["critical-events","acls","pals","emergency","administrative"].map((category) => `
              <button class="pill ${state.selectedCategory === category ? "active" : ""}" data-open-category="${category}">
                ${escapeHtml(titleCaseCategory(category))}
              </button>
            `).join("")}
          </div>
        </section>

        <section class="card">
          <h2>${escapeHtml(titleCaseCategory(state.selectedCategory))}</h2>
          <div class="protocol-grid">
            ${categoryProtocols.map(renderProtocolCard).join("")}
          </div>
        </section>
      </aside>

      <div class="page-stack">
        ${renderCaseContent(selectedProtocol())}
      </div>
    </div>
  `;
}

function renderCaseContent(protocol) {
  if (protocol.id === "acls-cardiac-arrest-vf-vt") {
    return renderVfVtCase(protocol);
  }

  if (protocol.id === "difficult-airway") {
    return renderDifficultAirwayCase(protocol);
  }

  if (protocol.id === "embolism-fat-venous-pulmonary") {
    return renderEmbolismCase(protocol);
  }

  if (protocol.id === "hemorrhage") {
    return renderHemorrhageCase(protocol);
  }

  if (protocol.id === "hypercapnia") {
    return renderHypercapniaCase(protocol);
  }

  if (protocol.id === "hypotension-adult-ped-dosing") {
    return renderHypotensionCase(protocol);
  }

  if (protocol.id === "hypoxia") {
    return renderHypoxiaCase(protocol);
  }

  if (protocol.id === "last-adult-ped-dosing") {
    return renderLastCase(protocol);
  }

  if (protocol.id === "mental-status-change-postoperative-cognitive-dysfunction") {
    return renderMentalStatusCase(protocol);
  }

  if (protocol.id === "mh-adult-ped-dosing") {
    return renderMhCase(protocol);
  }

  if (protocol.id === "spinal-anesthesia-adverse-events") {
    return renderSpinalCase(protocol);
  }

  if (protocol.id === "aspiration") {
    return renderAspirationCase(protocol);
  }

  if (protocol.id === "postoperative-airway-problem") {
    return renderPostoperativeAirwayCase(protocol);
  }

  if (protocol.rawSections?.length) {
    return renderSlideCase(protocol);
  }

  const structured = [];
  if (protocol.whenToSuspect.length) structured.push(sectionCard("When To Suspect", fallbackChecklist(protocol.whenToSuspect), "reference"));
  if (protocol.immediateActions.length) structured.push(sectionCard("Immediate Actions", fallbackChecklist(protocol.immediateActions), "start"));
  if (protocol.medications.length) {
    structured.push(sectionCard("Medications", `
      <div class="drug-table">
        ${protocol.medications.map((med) => `
          <div class="drug-row">
            <div class="drug-label">${escapeHtml(med.name)}</div>
            <div class="drug-value">${escapeHtml([med.dose, med.route, med.notes].filter(Boolean).join(" • "))}</div>
          </div>
        `).join("")}
      </div>
    `, "drug"));
  }
  if (protocol.airway.length) structured.push(sectionCard("Airway", fallbackChecklist(protocol.airway), "default"));
  if (protocol.monitoring.length) structured.push(sectionCard("Monitoring", fallbackChecklist(protocol.monitoring), "reference"));
  if (protocol.escalation.length) structured.push(sectionCard("Escalation / Transfer", fallbackChecklist(protocol.escalation), "operational"));
  if (protocol.equipment.length) structured.push(sectionCard("Equipment", fallbackChecklist(protocol.equipment), "default"));
  if (protocol.pearls.length) structured.push(sectionCard("Pearls", fallbackChecklist(protocol.pearls), "default"));
  if (protocol.references.length) structured.push(sectionCard("Source", fallbackChecklist(protocol.references), "operational"));

  const raw = structured.length
    ? ""
    : protocol.rawSections.map((section) => /^DRUG DOSES/i.test(section.title) ? drugSection(section) : sectionCard(section.title, fallbackChecklist(section.items))).join("");

  return `
    <section class="case-hero">
      <h2>${escapeHtml(protocol.title)}</h2>
      <p class="muted" style="color:#d8e2ee">${escapeHtml(protocol.summary)}</p>
      <div class="meta-row">
        <span class="meta-pill">${escapeHtml(protocol.population === "mixed" ? "Adult + Pediatric" : protocol.population)}</span>
        ${protocol.callEms ? `<span class="meta-pill urgent">Transfer / EMS</span>` : ""}
      </div>
    </section>
    ${structured.join("")}
    ${raw}
  `;
}

function renderHypotensionCase(protocol) {
  const checklist = protocol.rawSections.find((section) => section.title === "Checklist")?.items || [];
  const adult = protocol.rawSections.find((section) => /ADULT/i.test(section.title))?.items || [];
  const pedsSource = protocol.rawSections.find((section) => /PEDS/i.test(section.title))?.items || [];
  const differentialIndex = pedsSource.findIndex((item) => /^8 Differential Diagnosis/i.test(item));
  const peds = differentialIndex === -1 ? pedsSource : pedsSource.slice(0, differentialIndex);
  const differentialEnd = pedsSource.indexOf("Tamponade Age");
  const differential = differentialIndex === -1 ? [] : [
    ...pedsSource.slice(differentialIndex + 1, differentialEnd === -1 ? undefined : differentialEnd),
    ...(differentialEnd === -1 ? [] : ["Tamponade"])
  ];
  const differentialHeads = new Set(["Operative field", "Unaccounted blood loss", "Drugs/Allergy", "Breathing", "Circulation"]);
  const differentialGroups = [];
  differential.forEach((item) => {
    if (differentialHeads.has(item)) differentialGroups.push({ title: item, items: [] });
    else if (differentialGroups.length) differentialGroups.at(-1).items.push(item);
  });

  const doseBox = (title, items, tone) => `
    <section class="hypotension-dose-box ${tone}">
      <h3>${escapeHtml(title)}</h3>
      <div class="hypotension-dose-body">${drugRowsForSlide(items)}</div>
    </section>
  `;

  return `
    <section class="anaphylaxis-sheet hypotension-sheet">
      <header class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
          <h2>${escapeHtml(protocol.title)}</h2>
          <p>${escapeHtml(protocol.summary)}</p>
        </div>
      </header>

      <div class="hypotension-layout">
        <div class="hypotension-main">
          <div class="anaphylaxis-start-badge">START</div>
          <div class="anaphylaxis-main-box">${renderSlideChecklist(checklist, linkifyHypotensionChecklist)}</div>
          ${differential.length ? `
            <section class="hypotension-differential">
              <h3>8 Differential Diagnosis</h3>
              <div class="hypotension-differential-groups">
                ${differentialGroups.map((group) => `
                  <section class="hypotension-differential-group">
                    <h4>${escapeHtml(group.title)}</h4>
                    <ul>${group.items.map((item) => `<li>${linkifyHypotensionChecklist(item)}</li>`).join("")}</ul>
                  </section>
                `).join("")}
              </div>
            </section>
          ` : ""}
        </div>

        <aside class="hypotension-dose-stack">
          ${doseBox("DRUG DOSES and treatments ADULT", adult, "adult")}
          ${doseBox("DRUG DOSES and treatments PEDS", peds, "peds")}
          <section class="hypotension-bp-box">
            <div class="hypotension-bp-head"><span>Age</span><span>&lt;5<sup>th</sup> % systolic BP</span></div>
            <div class="hypotension-bp-row"><span>Preemie</span><b>&lt;57</b></div>
            <div class="hypotension-bp-row"><span>0-3 mo</span><b>&lt;60</b></div>
            <div class="hypotension-bp-row"><span>3-12 mo</span><b>&lt;70</b></div>
            <div class="hypotension-bp-row"><span>1-10 yr</span><b>&lt;70 + (age in years × 2)</b></div>
            <div class="hypotension-bp-row"><span>&gt;10 yr</span><b>&lt;90</b></div>
          </section>
        </aside>
      </div>
    </section>
  `;
}

function linkifyHypotensionChecklist(text) {
  const links = [
    ["CHKLST 3-BRADYCARDIA", "acls-bradycardia-unstable"],
    ["CHKLST 8-BRADYCARDIA", "pals-bradycardia-unstable"],
    ["CHKLST 2-Asystole/PEA", "acls-cardiac-arrest-asystole-pea"],
    ["CHKLST 6-Asystole/PEA", "pals-cardiac-arrest-asystole-pea"],
    ["CHKLST 16-HEMORRHAGE", "hemorrhage"],
    ["CHKLST 13-ANAPHYLAXIS", "allergies-anaphylaxis"],
    ["CHKLST 20-LAST", "last-adult-ped-dosing"],
    ["CHKLST 19-HYPOXIA", "hypoxia"],
    ["CHKLST 1-VF/VT", "acls-cardiac-arrest-vf-vt"],
    ["CHKLST 5- VF/VT", "pals-cardiac-arrest-vf-vt"],
    ["CHKLST 5-VF/VT", "pals-cardiac-arrest-vf-vt"],
    ["CHKLST 23", "mh-adult-ped-dosing"],
    ["CHKLST 15", "embolism-fat-venous-pulmonary"],
    ["CHKLST 3", "acls-bradycardia-unstable"],
    ["CHKLST 7", "pals-bradycardia-unstable"],
    ["CHKLST 4", "acls-tachycardia-unstable"],
    ["CHKLST 8", "pals-tachycardia-unstable"]
  ];
  const matches = [];
  links.forEach(([label, id]) => {
    let start = text.indexOf(label);
    while (start !== -1) {
      if (!matches.some((match) => start < match.end && start + label.length > match.start)) {
        matches.push({ start, end: start + label.length, label, id });
      }
      start = text.indexOf(label, start + label.length);
    }
  });
  matches.sort((a, b) => a.start - b.start);
  if (!matches.length) return escapeHtml(text);
  let cursor = 0;
  return matches.map((match) => {
    const before = escapeHtml(text.slice(cursor, match.start));
    cursor = match.end;
    return `${before}<button class="manual-case-link" type="button" data-open-protocol="${match.id}">${escapeHtml(match.label)}</button>`;
  }).join("") + escapeHtml(text.slice(cursor));
}

function renderHypoxiaCase(protocol) {
  const list = (items) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  return `
    <section class="anaphylaxis-sheet hypoxia-sheet">
      <header class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
          <h2>${escapeHtml(protocol.title)}</h2>
          <p>Unexplained oxygen desaturation.</p>
        </div>
      </header>

      <div class="hypoxia-flow">
        <section class="hypoxia-actions">
          <div class="anaphylaxis-start-badge">START</div>
          <div class="hypoxia-step"><b>1 Call for help and a code cart</b><span>Ask: “Who will be the crisis manager”?</span></div>
          <div class="hypoxia-step"><b>2 Turn FiO<sub>2</sub> to 100% and turn off volatile anesthetics</b><span>Confirm inspired FiO<sub>2</sub> = 100% on gas analyzer</span><span>Confirm ETCO<sub>2</sub> and changes in capnography morphology</span></div>
          <div class="hypoxia-step"><b>3 Hand ventilate to assess compliance</b></div>
          <div class="hypoxia-step"><b>4 Listen to breath sounds</b></div>
        </section>

        <section class="hypoxia-consider">
          <h3>Consider…</h3>
          ${list(["Draw blood gas for transfer", "Suction (to clear secretions, mucus plug)", "Disconnect circuit and hand-mask"])}
        </section>

        <section class="hypoxia-transfer-box">
          <h3>Additional tests to suggest during transfer</h3>
          ${list(["Fiberoptic bronchoscopy", "Chest x-ray", "Electrocardiogram", "Transesophageal echocardiogram", "Chest ultrasound"])}
        </section>

        <section class="hypoxia-check-chain">
          <h3>Check for</h3>
          ${["Pulse, BP, PIP", "ET tube position", "Pulse oximeter placement", "Circuit integrity: disconnection, bends, holes"].map((item, index) => `
            ${index ? `<div class="hypoxia-down-arrow">↓</div>` : `<div class="hypoxia-down-arrow">↓</div>`}
            <div class="hypoxia-check-item">${escapeHtml(item)}</div>
          `).join("")}
        </section>

        <section class="hypoxia-differential">
          <h3>Differential Diagnosis</h3>
          <svg class="hypoxia-split-lines" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
            <path d="M50 2 L25 24"></path><path d="M50 2 L75 24"></path>
          </svg>
          <div class="hypoxia-branch-grid">
            <div class="hypoxia-branch">
              <h4>YES <strong>AIRWAY</strong> issue suspected</h4>
              <div class="hypoxia-branch-box">
                <h5>Airway/Breathing</h5>
                ${list(["Aspiration", "Atelectasis", "Bronchospasm", "Hypoventilation", "Laryngospasm", "Obesity/positioning", "Pneumothorax", "Pulmonary edema", "Right mainstem intubation", "Ventilator settings → autoPEEP"])}
              </div>
            </div>
            <div class="hypoxia-branch">
              <h4>NO <strong>AIRWAY</strong> issue suspected</h4>
              <div class="hypoxia-branch-box">
                <h5>Circulation</h5>
                <ul>
                  <li>Embolism, go to <button class="manual-case-link" type="button" data-open-protocol="embolism-fat-venous-pulmonary">CHKLST 16-EMBOLISM</button></li>
                  <li>Heart disease</li><li>Severe sepsis</li>
                  <li>If hypoxia is associated with hypotension, go to <button class="manual-case-link" type="button" data-open-protocol="hypotension-adult-ped-dosing">CHKLST 19-HYPOTENSION</button></li>
                </ul>
                <h5>Drugs/Allergies</h5>
                <ul>
                  <li>Recent drugs given, ie NMB</li>
                  <li>Dose error/allergy/anaphylaxis, go to <button class="manual-case-link" type="button" data-open-protocol="allergies-anaphylaxis">CHKLST 14-ANAPHYLAXIS</button></li>
                  <li>Dyes and abnormal hemoglobin, ie methemoglobinemia, methylene blue</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderLastCase(protocol) {
  const checklist = (protocol.rawSections.find((section) => section.title === "Checklist")?.items || [])
    .filter((item) => !/^Altered mental status, neurological symptoms/i.test(item));
  const dosePanel = (population, midazolam, tone) => `
    <section class="last-dose-box ${tone}">
      <h3>DRUG DOSES <span>and treatment ${population}</span></h3>
      <div class="last-dose-body">
        <div class="last-dose-row"><b>Lipid emulsion</b><span>bolus 1.5 <em>ml</em>/kg IV over 1 min<br>continue infusion 0.25 <em>ml</em>/kg/min<br>increase infusion to 0.5 <em>ml</em>/kg/min if BP remains low</span></div>
        <div class="last-dose-row"><b>Midazolam</b><span>${escapeHtml(midazolam)}</span></div>
        <div class="last-dose-row"><b>Epinephrine</b><span>&lt;1 MICROgram/kg</span></div>
      </div>
    </section>
  `;

  return `
    <section class="anaphylaxis-sheet last-sheet">
      <header class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
          <h2>${escapeHtml(protocol.title)}</h2>
          <p>${escapeHtml(protocol.whenToSuspect[0] || protocol.summary)}</p>
        </div>
      </header>

      <div class="last-layout">
        <div class="last-primary">
          <div class="anaphylaxis-start-badge">START</div>
          <div class="anaphylaxis-main-box">${renderSlideChecklist(checklist, linkifyLastChecklist)}</div>
        </div>

        <section class="last-therapy">
          <div class="last-step"><b>8 Give Lipid emulsion 20% therapy</b>
            <span>Bolus 1.5 ml/kg over 1 min</span>
            <span>Start continuous infusion</span>
            <span>Repeat bolus for persistent cardiovascular collapse</span>
            <span>Double infusion rate if BP remains low</span>
            <span>Continue infusion for at least 10 min after stable vitals</span>
            <span>Max 10 ml/kg over first 30 min</span>
          </div>
          <div class="last-step"><b>9 Post LAST events at</b><span><a class="last-external-link" href="https://lipidrescue.org/" target="_blank" rel="noopener noreferrer">www.lipidrescue.org</a></span></div>
          <div class="last-step"><b>10 Report use of LIPID at</b><span><a class="last-external-link" href="https://www.lipidregistry.org/" target="_blank" rel="noopener noreferrer">www.lipidregistry.org</a></span></div>
        </section>

        <aside class="last-dose-stack">
          ${dosePanel("ADULT", "2mg", "adult")}
          ${dosePanel("PEDS", "0.05-1 mg/kg IV", "peds")}
        </aside>
      </div>
    </section>
  `;
}

function linkifyLastChecklist(text) {
  if (/^If VF\/VT/i.test(text)) {
    return 'If VF/VT, <span class="last-link-pair">adult <button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-vf-vt">CHKLST 1-VF/VT</button></span>; <span class="last-link-pair">peds <button class="manual-case-link" type="button" data-open-protocol="pals-cardiac-arrest-vf-vt">CHKLST 5-VF/VT</button></span>';
  }
  if (/^If asystole\/PEA/i.test(text)) {
    return 'If asystole/PEA, <span class="last-link-pair">adult <button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-asystole-pea">CHKLST 2-Asystole/PEA</button></span>; <span class="last-link-pair">peds <button class="manual-case-link" type="button" data-open-protocol="pals-cardiac-arrest-asystole-pea">CHKLST 6-Asystole/PEA</button></span>';
  }
  return linkifyHypotensionChecklist(text).replace(
    "CHKLST 26-Transfer of non-MH patient",
    '<button class="manual-case-link" type="button" data-open-protocol="transfer-of-care-non-mh-patient">CHKLST 26-Transfer of non-MH patient</button>'
  );
}

function renderMentalStatusCase(protocol) {
  const checklist = protocol.rawSections.find((section) => section.title === "Checklist")?.items.slice(0, -1) || [];
  const critical = [
    "If bleeding", "Go to CHKLST 16- HEMORRHAGE", "If hemodynamically unstable", "Start CPR",
    "If VF/VT, adult CHKLST 1-VF/VT; peds CHKLST 5-VF/VT",
    "If asystole/PEA, adult CHKLST 2- Asystole/PEA; peds CHKLST 6- Asystole/PEA",
    "If Bradycardia, adult CHKLST 3- BRADYCARDIA; peds CHKLST 8- BRADYCARDIA"
  ];
  const reversibleLeft = ["Hypoglycemia", "Hyperglycemia", "Opioids", "Benzodiazepines", "Acid-base disturbance", "Electrolyte abnormalities", "Hypoxia, go to CHKLST 20-HYPOXIA", "Hypercapnia, go to CHKLST 18-HYPERCAPNIA", "Azotemia"];
  const reversibleRight = ["Hypovolemia", "Hypotension, go to CHKLST 19-HYPOTENSION", "Acute blood loss, go to CHKLST 17-HEMORRHAGE", "Urinary retention", "Infection, ie pneumonia, UTI", "Steroids", "Anticholinergics", "DKA"];

  return `
    <section class="anaphylaxis-sheet mental-sheet">
      <header class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
          <h2>${escapeHtml(protocol.title)}</h2>
          <p>Delirium, obtundation, coma, confusion, speech deficit</p>
        </div>
      </header>

      <div class="mental-layout">
        <div class="mental-primary">
          <div class="anaphylaxis-start-badge">START</div>
          <div class="anaphylaxis-main-box">${renderSlideChecklist(checklist)}</div>
        </div>

        <div class="mental-center-stack">
          <section class="mental-panel labs">
            <h3>Consider LABs during transfer sign-out</h3>
            <div>Complete blood count, metabolic panel, electrolytes, liver function tests</div>
            <div>Urinalysis, urine toxicology</div>
          </section>
          <section class="mental-panel stroke">
            <h3>STROKE assessment</h3>
            <div class="mental-stroke-row"><b>Facial droop</b><span>Smile, show teeth</span></div>
            <div class="mental-stroke-row"><b>Arm drift</b><span>Close eyes, extend arms forward, palms up for 10 sec</span></div>
            <div class="mental-stroke-row"><b>Speech</b><span>Say “It is a sunny day in Boston”</span></div>
            <div class="mental-stroke-row"><b>Time</b><span>Recognize symptoms fast</span></div>
          </section>
        </div>

        <div class="mental-right-stack">
          <section class="mental-panel mental-drugs">
            <h3>DRUG DOSES <span>and treatment ADULT</span></h3>
            <div class="mental-drug-row"><b>Naloxone</b><span>0.4-2mg IV/IM/SC, repeat every 3 min as necessary</span></div>
            <div class="mental-drug-row"><b>Flumazenil</b><span>0.2mg IV, repeat as necessary</span></div>
            <div class="mental-drug-row"><b>Dextrose</b><span>50 cc D50W IV</span></div>
          </section>
          <section class="mental-panel mental-critical">
            <h3>Critical CHANGES</h3>
            <div class="mental-critical-body">${critical.map((item) => `<div>${item === "Start CPR" ? `<strong>${escapeHtml(item)}</strong>` : linkifyMentalText(item)}</div>`).join("")}</div>
          </section>
        </div>

        <section class="mental-panel mental-reversible">
          <h3>Reversible Causes</h3>
          <div class="mental-reversible-grid">
            <div>${reversibleLeft.map((item) => `<div>${linkifyMentalText(item)}</div>`).join("")}</div>
            <div>${reversibleRight.map((item) => `<div>${linkifyMentalText(item)}</div>`).join("")}</div>
          </div>
        </section>
      </div>
    </section>
  `;
}

function linkifyMentalText(text) {
  const links = [
    ["CHKLST 16- HEMORRHAGE", "hemorrhage"], ["CHKLST 1-VF/VT", "acls-cardiac-arrest-vf-vt"],
    ["CHKLST 5-VF/VT", "pals-cardiac-arrest-vf-vt"], ["CHKLST 2- Asystole/PEA", "acls-cardiac-arrest-asystole-pea"],
    ["CHKLST 6- Asystole/PEA", "pals-cardiac-arrest-asystole-pea"], ["CHKLST 3- BRADYCARDIA", "acls-bradycardia-unstable"],
    ["CHKLST 8- BRADYCARDIA", "pals-bradycardia-unstable"], ["CHKLST 20-HYPOXIA", "hypoxia"],
    ["CHKLST 18-HYPERCAPNIA", "hypercapnia"], ["CHKLST 19-HYPOTENSION", "hypotension-adult-ped-dosing"],
    ["CHKLST 17-HEMORRHAGE", "hemorrhage"]
  ];
  let html = escapeHtml(text);
  links.forEach(([label, id]) => {
    html = html.replace(label, `<button class="manual-case-link" type="button" data-open-protocol="${id}">${escapeHtml(label)}</button>`);
  });
  return html;
}

function renderMhCase(protocol) {
  const checklist = protocol.rawSections.find((section) => section.title === "Checklist")?.items || [];
  const diff = [
    ["Cardiopulmonary", ["Hypoventilation", "Sepsis"], "Endocrine", ["Thyrotoxicosis", "Pheochromocytoma"]],
    ["Iatrogenic", ["Exogenous CO₂ source", "Overwarming", "Neuroleptic Malignant Syndrome"]],
    ["Neurologic", ["Meningitis", "Intracranial bleed", "Hypoxic encephalopathy", "Traumatic brain injury"]],
    ["Toxins", ["Radiologic contrast", "Anticholinergic syndrome", "Cocaine, amphetamine, salicylate, alcohol withdrawal"]]
  ];
  const diffColumn = (groups) => `<div>${groups.map((group, index) => index % 2 === 0 ? `<h4>${escapeHtml(group)}</h4>` : group.map((item) => `<div>${escapeHtml(item)}</div>`).join("")).join("")}</div>`;

  return `
    <section class="anaphylaxis-sheet mh-sheet">
      <header class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
          <h2>Malignant Hyperthermia</h2>
          <p>In presence of triggering agent: unexpected increase in ETCO2, unexplained tachycardia/tachypnea, prolonged masseter muscle spasm after succinylcholine. Hyperthermia is a LATE sign.</p>
        </div>
      </header>

      <div class="mh-layout">
        <div class="mh-primary">
          <div class="anaphylaxis-start-badge">START</div>
          <div class="anaphylaxis-main-box">${renderSlideChecklist(checklist)}</div>
        </div>

        <div class="mh-center-stack">
          <section class="mh-followup">
            <div class="mh-follow-step"><b>14 Consider drawing labs for transfer</b>${["Arterial blood gas", "Electrolytes", "Serum creatinine kinase", "Serum/urine myoglobin", "Coagulation profile"].map((x) => `<span>${escapeHtml(x)}</span>`).join("")}</div>
            <div class="mh-follow-step"><b>15 Initiate supportive care</b><span>Consider cooling patient if T &gt; 38.5C</span><span>Place Foley catheter, monitor urine output</span></div>
          </section>
          <section class="mh-trigger-box"><h3>TRIGGERING AGENTS</h3><div>Inhalational (volatile) anesthetics</div><div>Succinylcholine</div></section>
        </div>

        <aside class="mh-dose-box">
          <h3>DRUG DOSES <span>and treatments ADULT</span></h3>
          <div class="mh-dose-row"><b>Dantrolene:</b><span>Reconstitute 20mg vial in 60cc sterile water (shake until dilute)</span></div>
          <div class="mh-dose-row"><b>--- or ---<br>Ryanodex:</b><span>Reconstitute 250mg vial with 5 cc sterile water (shake until orange and opaque)</span></div>
          <div class="mh-dose-wide"><b>Give 2.5mg/kg, repeat up to 10mg/kg until symptoms subside</b><br>Rarely may require up to 30mg/kg</div>
          <div class="mh-dose-row mh-bicarbonate"><b>Bicarbonate</b><span>1-2mEq/kg, slow IV push max 50mEq</span></div>
          <h4>HYPERKALEMIA <span>treatment</span></h4>
          <div class="mh-dose-row"><b>1. Ca gluconate</b><span>30mg/kg IV, max 3000mg</span></div>
          <div class="mh-dose-row"><b>--- or ---<br>Ca chloride</b><span>10mg/kg IV, max 2000mg</span></div>
          <div class="mh-dose-row"><b>2. Insulin</b><span>10 units regular IV<br>1-2 amps D50W</span></div>
        </aside>

        <section class="mh-differential">
          <h3>DIFFERENTIAL <span>diagnosis (consider if refractory to high doses of dantrolene)</span></h3>
          <div class="mh-differential-grid">${diff.map(diffColumn).join("")}</div>
        </section>
      </div>
    </section>
  `;
}

function renderSpinalCase(protocol) {
  const checklist = protocol.rawSections.find((section) => section.title === "Checklist")?.items || [];
  const link = (label, id) => `<button class="manual-case-link" type="button" data-open-protocol="${id}">${escapeHtml(label)}</button>`;
  const bulletList = (items) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;

  return `
    <section class="anaphylaxis-sheet spinal-sheet">
      <header class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
          <h2>${escapeHtml(protocol.title)}</h2>
          <p>Hypotension, decreased respiratory effort, bradycardia, numbness or tingling in the fingers and hands, cardiopulmonary instability after spinal procedure</p>
        </div>
      </header>

      <div class="spinal-layout">
        <div class="spinal-primary">
          <div class="anaphylaxis-start-badge">START</div>
          <div class="anaphylaxis-main-box">${renderSlideChecklist(checklist)}</div>
          <section class="spinal-treatment">
            <h3>Treat hypotension</h3><div class="spinal-arrow">↓</div><p>Phenylephrine first line</p>
            <div class="spinal-arrow">↓</div><h3>Treat bradycardia</h3><div class="spinal-arrow">↓</div>
            <p>Reverse with atropine and ephedrine</p><p>Epinephrine second line</p>
            <p>${link("Go to CHKLST 3-BRADYCARDIA", "acls-bradycardia-unstable")}</p>
            <div class="spinal-arrow">↓</div><h3>Treat respiratory insufficiency</h3>
            <div class="spinal-arrow">↓</div>
            <p>Reverse with naloxone, flumazenil if necessary</p>
            <div class="spinal-arrow">↓</div>
            <section class="spinal-labs"><h3>Consider drawing labs for transfer</h3><div class="spinal-arrow">↓</div><p>CBC, electrolytes, ABG</p></section>
          </section>
        </div>

        <div class="spinal-center">
          <section class="spinal-diff-box">
            <h3 class="spinal-diff-title">Differential Diagnosis</h3>
            <div class="spinal-differential">
            <section><h4>Drugs/Allergy</h4>${bulletList([
              `Anaphylaxis, go to ${link("CHKLST 13-ANAPHYLAXIS", "allergies-anaphylaxis")}`,
              "Recent drugs given, ie vasodilators", "Dose error, wrong drug",
              `Drugs used on field, ie systemic injection of local anesthetic, go to ${link("CHKLST 21-LAST", "last-adult-ped-dosing")}`
            ])}</section>
            <section><h4>Breathing</h4>${bulletList(["High Spinal", "Hypoventilation", `Hypoxia, go to ${link("CHKLST 20-HYPOXIA", "hypoxia")}`, "Increased PEEP", "Increased valsalva", "Persistent hyperventilation", "Pneumothorax", "Pulmonary edema"])}</section>
            <section><h4>Circulation</h4>${bulletList([
              `Bradycardia, adult ${link("CHKLST 3-BRADYCARDIA", "acls-bradycardia-unstable")} peds ${link("CHKLST 7-BRADYCARDIA", "pals-bradycardia-unstable")}`,
              `Malignant hyperthermia, go to ${link("CHKLST 23-MH", "mh-adult-ped-dosing")}`,
              `Tachycardia, adult ${link("CHKLST 4-TACHYCARDIA", "acls-tachycardia-unstable")} peds ${link("CHKLST 8-TACHYCARDIA", "pals-tachycardia-unstable")}`,
              "Bone cementing", "Myocardial infarction", `Emboli, go to ${link("CHKLST 16-EMBOLI", "embolism-fat-venous-pulmonary")}`, "Tamponade"
            ])}</section>
            </div>
          </section>
        </div>

        <aside class="spinal-dose-box">
          <h3>DRUG DOSES <span>and treatments ADULT</span></h3>
          ${[
            ["Atropine", "0.5mg IV; max 3mg total"], ["Naloxone", "0.4-2mg IV/IM/SC, repeat every 3 min as necessary"],
            ["Flumazenil", "0.2mg IV, repeat as necessary"], ["Ephedrine", "5-25mg IV, repeat as necessary"],
            ["Phenylephrine", "40-200 MICROgrams IV, repeat as necessary"], ["Epinephrine", "2-10 MICROgram/min IV"]
          ].map(([name, dose]) => `<div class="spinal-dose-row"><b>${name}</b><span>${dose}</span></div>`).join("")}
        </aside>
      </div>
    </section>
  `;
}

function renderAspirationCase(protocol) {
  const checklist = protocol.rawSections.find((section) => section.title === "Checklist")?.items.slice(0, 10) || [];
  return `
    <section class="anaphylaxis-sheet aspiration-sheet">
      <header class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
          <h2>${escapeHtml(protocol.title)}</h2>
          <p>${escapeHtml(protocol.summary)}</p>
        </div>
      </header>
      <div class="aspiration-layout">
        <div class="anaphylaxis-start-badge">START</div>
        <div class="anaphylaxis-main-box">${renderSlideChecklist(checklist)}</div>
        <section class="aspiration-airway-box">
          <div class="aspiration-airway-arrow" aria-hidden="true">→</div>
          <div>
            <h3>Airway management strategies:</h3>
            <ul>
              <li>If gastric volume should be reduced, consider nasogastric aspiration</li>
              <li>If gastric acidity should be reduced, consider antacids, H2 histamine antagonist, or proton pump inhibitors</li>
            </ul>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderPostoperativeAirwayCase(protocol) {
  const panel = (title, groups, extraClass = "") => `
    <section class="postop-panel ${extraClass}">
      <h3>${escapeHtml(title)}</h3>
      <div class="postop-panel-body">${groups.map(([heading, items]) => `
        ${heading ? `<h4>${heading}</h4>` : ""}
        ${items.map((item) => `<div>${item}</div>`).join("")}
      `).join("")}</div>
    </section>`;
  const cardiacLink = '<button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-vf-vt">CHKLST 1-CARDIAC ARREST</button>';

  return `
    <section class="anaphylaxis-sheet postop-sheet">
      <header class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
          <h2>${escapeHtml(protocol.title)}</h2>
          <p>${escapeHtml(protocol.summary)}</p>
        </div>
      </header>
      <div class="postop-layout">
        <div class="postop-left">
          <div class="anaphylaxis-start-badge">START</div>
          <div class="postop-actions">
            <b>1 Call for help and a code cart</b>
            <b>2 Check ABCs and consider CAB protocols</b>
            <b>3 Call 911, consider sending the patient to the operating room</b>
            <b>4 Determine patient disposition</b>
          </div>
        </div>
        <section class="postop-diff-box">
          <h3>Differential Diagnosis</h3>
          <div class="postop-diff-grid">
            <div class="postop-differential">
              <h4>Airway obstruction</h4>
              <p>Administer FIO2 100%, suction secretions, jaw-thrust, insert oral or nasal airway</p>
              <h4>Anatomical management</h4>
              <p>Laryngospasm treatment includes removing irritating stimulus, hyperextend neck, elevating head, oxygenation, suction, or positive pressure ventilation</p>
            </div>
            <div class="postop-center">
              <section><h4>Obstruction sleep apnea</h4><p>Monitoring apnea and oxygen saturation</p></section>
              <section><h4>Postoperative hypoxemia</h4><p>Address underlying cause (i.e., opioids, general anesthesia, insufficient reversal of neuromuscular blocking agents, decreased chest wall compliance, abdominal distension, constrictive dressings, or postoperative pain)</p></section>
            </div>
          </div>
        </section>
        <aside class="postop-side">
          ${panel("ABC Assessment", [
            ["Airway", ["Determine if the patient is able to talk", "Look for edema, blood, vomiting, foreign body", "Listen for any noise or obstructions"]],
            ["Breathing", ["Look for work of breathing, respiratory rate", "Listen for breath sounds", "Check pulse oximetry"]],
            ["Circulation", ["Look at mental status, color", "Feel peripheral pulse", "Check heart rate, cardiac rhythm, bloood pressure"]]
          ])}
          ${panel("CAB Protocol", [
            ["", [`For CPR, go to ${cardiacLink}`]],
            ["Compression", ["Push hard and fast on the center of the adult patient's chest"]],
            ["Airway", ["Tilt the patient's head back and lift the chin to open the airway"]],
            ["Breathing", ["Give mouth to mouth rescue breaths"]]
          ])}
        </aside>
      </div>
    </section>
  `;
}

function renderDifficultAirwayCaseLegacy(protocol) {
  return `
    <div class="airway-case-wrap">
      <header class="vfvt-context-header">
        <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
        <h2>${escapeHtml(protocol.title)}</h2>
        <p>Two unsuccessful intubation attempts by an airway expert</p>
      </header>

      <section class="airway-flow" aria-label="Difficult airway decision flowchart">
        <svg class="airway-flow-lines" viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="airway-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L8,4 L0,8 z"></path>
            </marker>
          </defs>
          <path d="M135 175 L135 245"></path>
          <path d="M270 150 L410 150 L410 105 L505 105"></path>
          <path d="M640 105 L835 105 L835 150"></path>
          <path d="M270 475 L410 475 L410 105 L505 105"></path>
          <path d="M270 475 L370 475 L370 555 L430 555"></path>
          <path d="M135 625 L135 705 L430 705 L430 650"></path>
          <path d="M650 650 L710 650"></path>
          <path d="M820 650 L875 650"></path>
        </svg>
        <div class="airway-start-block">
          <div class="vfvt-start">START</div>
          <div class="airway-primary">1 Call for help and a code cart</div>
          <div class="airway-prompt">Consider initiating transfer protocol</div>
          <div class="airway-primary">2 Call for airway cart and video laryngoscope</div>
          <div class="airway-primary">3 Turn FiO<sub>2</sub> to 100%, <span>bag mask ventilate</span></div>
          <div class="airway-primary">4 Confirm adequate ventilation</div>
        </div>

        <div class="airway-branch airway-adequate">If ventilation <strong>ADEQUATE</strong></div>

        <div class="airway-box airway-consider">
          <h3>Consider</h3>
          <div class="airway-box-body">
            <div class="airway-major">Awakening patient or other means to secure airway</div>
            <div class="airway-item">LMA or face mask for duration of operation</div>
            <div class="airway-item">Video laryngoscope</div>
            <div class="airway-item">LMA as conduit to intubation</div>
            <div class="airway-item">Spontaneous ventilation</div>
            <div class="airway-item">Different blades</div>
            <div class="airway-item">Intubating stylet</div>
            <div class="airway-item">Light wand</div>
            <div class="airway-item">Fiberoptic intubation</div>
            <div class="airway-item">Retrograde intubation</div>
            <div class="airway-item">Blind oral/nasal intubation</div>
            <div class="airway-major">If awakening patient, try</div>
            <div class="airway-item">Awake intubation</div>
            <div class="airway-item">Regional or local for procedure</div>
            <div class="airway-item">Canceling the case</div>
          </div>
        </div>

        <div class="airway-branch airway-not-adequate">If ventilation <strong>NOT ADEQUATE</strong></div>

        <div class="airway-box airway-optimize">
          <div class="airway-box-body">
            <div class="airway-major">Optimize Ventilation</div>
            <div class="airway-item">Reposition Patient</div>
            <div class="airway-item">Oral/nasal airway</div>
            <div class="airway-item">Two-handed mask</div>
            <div class="airway-major">Check Equipment</div>
            <div class="airway-item">Use 100% O<sub>2</sub></div>
            <div class="airway-item">Capnography</div>
            <div class="airway-item">Circuit integrity</div>
            <div class="airway-major">Check Ventilation</div>
          </div>
        </div>

        <div class="airway-branch airway-still-left">If still <strong>NOT ADEQUATE</strong></div>

        <div class="airway-box airway-rescue">
          <div class="airway-box-body">
            <div class="airway-major">Place LMA or other supraglottic device or attempt intubation by video laryngoscope</div>
            <div class="airway-major">If considering trach (if available)</div>
            <div class="airway-major">Prep neck, call code airway <span>(tracheostomy kit, surgeon)</span></div>
            <div class="airway-major">Re-check ventilation</div>
          </div>
        </div>

        <div class="airway-branch airway-still-right">Still <strong>NOT ADEQUATE</strong></div>

        <div class="airway-box airway-surgical">
          <div class="airway-box-body">
            <div class="airway-major">Surgical Airway</div>
            <div class="airway-major airway-transfer">Mandatory transfer</div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderDifficultAirwayCase(protocol) {
  return `
    <div class="airway-case-wrap airway-source-layout">
      <header class="vfvt-context-header">
        <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
        <h2>${escapeHtml(protocol.title)}</h2>
        <p>Two unsuccessful intubation attempts by an airway expert</p>
      </header>
      <figure class="airway-source-figure">
        <img src="./assets/difficult-airway-flowchart.png" alt="Difficult airway decision flowchart showing adequate and inadequate ventilation pathways, rescue airway options, and mandatory transfer." />
      </figure>
    </div>
  `;
}

function renderEmbolismCase(protocol) {
  return `
    <div class="embolism-case-wrap">
      <header class="vfvt-context-header">
        <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
        <h2>${escapeHtml(protocol.title)}</h2>
        <p>Decreased end-tidal CO2, decreased oxygen saturation, hypotension</p>
      </header>
      <div class="embolism-layout">
        <div class="embolism-main">
          <section class="embolism-box embolism-initial">
            <div class="vfvt-start">START</div>
            <div class="embolism-step"><strong>1 Call for help and a code cart</strong></div>
            <div class="embolism-substep">Ask: “Who will be the crisis manager?”</div>
            <div class="embolism-substep">Call: “Initiate Transfer Protocol”</div>
            <div class="embolism-step"><strong>2 Turn FiO<sub>2</sub> to 100%,</strong> bag-mask ventilate</div>
            <div class="embolism-step"><strong>3 Turn off nitrous oxide and volatile anesthetics</strong></div>
            <div class="embolism-step"><strong>4 Secure airway,</strong> confirm adequate ventilation</div>
            <div class="embolism-step"><strong>5 Monitor vitals</strong></div>
            <div class="embolism-substep">BP, O<sub>2</sub>, pulse</div>
          </section>

          <div class="embolism-choice-label">Choose the suspected embolism type</div>
          <div class="embolism-types">
            <section class="embolism-type-card">
              <h3>Venous/air embolism</h3>
              <ul>
                <li>Find source and stop entry of air, including open venous lines</li>
                <li>Ask surgeon to irrigate wound with saline</li>
                <li>Turn off all sources of pressurized air (laparoscopy, endoscopy)</li>
                <li>Lower surgical site below heart, if possible (reverse Trendelenburg)</li>
                <li>Consider labs for transfer: ABG, BMP</li>
              </ul>
            </section>
            <section class="embolism-type-card">
              <h3>Pulmonary embolism</h3>
              <div class="embolism-ecg">ECG <strong>S1Q3T3</strong></div>
              <ul>
                <li>Identify risk factors: neoplasm, immobility, lack of anticoagulation</li>
                <li>Use vasopressors (norepinephrine) to improve RV function and maintain BP; titrate to effect</li>
                <li>Support airway</li>
                <li>Inform EMS of suspected PE and consideration for thrombolysis, STAT cardiovascular surgery, or interventional radiology</li>
              </ul>
            </section>
            <section class="embolism-type-card">
              <h3>Fat embolism</h3>
              <ul>
                <li>Look for petechial rash, fever, tachycardia, and tachypnea</li>
                <li>Ask surgeon to irrigate wound with saline</li>
                <li>Maintain adequate BP while avoiding volume overload</li>
                <li>Consider labs: ABG, BMP, ESR, fibrinogen, serum microglobulin</li>
              </ul>
            </section>
          </div>

          <section class="embolism-box embolism-followup">
            <div class="embolism-step"><strong>6 If hypotensive, give IV fluids</strong></div>
            <div class="embolism-substep">If severe, give vasopressors</div>
            <div class="embolism-substep"><button class="manual-case-link" type="button" data-open-protocol="hypotension-adult-ped-dosing">Go to CHKLST 19-HYPOTENSION</button></div>
            <div class="embolism-step"><strong>7 Consider</strong></div>
            <div class="embolism-substep">Left lateral decubitus positioning</div>
            <div class="embolism-substep">TEE, CT, and anticoagulation during transfer sign-out</div>
          </section>
        </div>

        <aside class="embolism-side">
          <section class="vfvt-panel vfvt-drugs">
            <h3>DRUG DOSES <span>and treatments ADULT</span></h3>
            <div class="vfvt-panel-body">
              <div class="vfvt-subtitle">Anticoagulant treatment for acute PE</div>
              <div class="embolism-treatment"><strong>IV UFH, TPA alteplase:</strong> Suggest to 911/ambulance as treatment.</div>
            </div>
          </section>
          <section class="vfvt-panel embolism-critical-panel">
            <h3>Critical CHANGES</h3>
            <div class="vfvt-panel-body">
              <p>If PEA develops (no pulse):</p>
              <ul>
                <li>Start CPR</li>
                <li><strong>Adults:</strong> <button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-asystole-pea">CHKLST 2-Asystole/PEA</button></li>
                <li><strong>Peds:</strong> <button class="manual-case-link" type="button" data-open-protocol="pals-cardiac-arrest-asystole-pea">CHKLST 6-Asystole/PEA</button></li>
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;
}

function renderHemorrhageCase(protocol) {
  const checklist = [
    "1 Call for help and a code cart",
    "Ask: “Who will be the crisis manager”?",
    "Call: “Initiate Transfer Protocol”",
    "2 Open IV fluids and ensure adequate access",
    "3 Turn FiO2 to 100%, turn down volatile anesthetics",
    "4 Hold pressure over area of bleeding",
    "5 Discuss management plan between surgical, anesthesiology, and nursing teams",
    "6 Damage control surgery (pack, close, resuscitate)",
    "7 Keep patient warm",
    "8 Consider drawing labs for transfer",
    "CBC, coags, BMP, ABG, ionized calcium"
  ];

  return `
    <section class="anaphylaxis-sheet hemorrhage-sheet">
      <div class="anaphylaxis-header">
        <div class="anaphylaxis-title-block">
          <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
          <h2>${escapeHtml(protocol.title)}</h2>
          <p>Uncontrolled, acute bleeding</p>
        </div>
      </div>
      <div class="anaphylaxis-grid hemorrhage-grid">
        <div class="anaphylaxis-main">
          <div class="anaphylaxis-start-badge">START</div>
          <div class="anaphylaxis-main-box">
            ${renderSlideChecklist(checklist)}
          </div>
        </div>
        <aside class="anaphylaxis-side">
          <section class="section-card section-operational hemorrhage-hospital-box">
            <div class="section-header">Suggestions for hospital actions…</div>
            <div class="section-body">
              <div class="anaphylaxis-line prompt">Electrolyte disturbances</div>
              <div class="anaphylaxis-line prompt">Contact blood bank</div>
              <div class="anaphylaxis-line prompt"><strong>Suggest expert consultation, transfusion medicine, vascular surgery, during transfer-signout</strong></div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  `;
}

function renderHypercapniaCase(protocol) {
  const differential = [
    "Laparoscopic procedure (consider diaphragmatic incompetence)",
    "Hypermetabolic state: thyroid storm, pheochromocytoma, sepsis",
    "Drug-induced respiratory depression: opioids, benzodiazepines, propofol, inhaled halogenated anesthetics",
    "Malignant hyperthermia",
    "Physiologic: increased dead space (COPD), hypoventilation"
  ];

  return `
    <section class="hypercapnia-sheet">
      <header class="vfvt-context-header">
        <div class="manual-section-kicker">${escapeHtml(getManualSectionLabel(protocol))} <span>• ${escapeHtml(getPopulationLabel(protocol))}</span></div>
        <h2>${escapeHtml(protocol.title)}</h2>
        <p>${escapeHtml(protocol.summary)}</p>
      </header>
      <div class="hypercapnia-layout">
        <div class="hypercapnia-algorithm">
          <div class="hypercapnia-flowchart-native" aria-label="Hypercapnia response flowchart">
            <section class="hyper-flow-start hyper-flow-card">
              <div class="vfvt-start">START</div>
              <div class="hyper-flow-step">1 Call for help</div>
              <div class="hyper-flow-step">2 Secure airway and ventilate</div>
              <div class="hyper-flow-detail">Ensure mechanical ventilation has adequate tidal volumes</div>
            </section>

            <div class="hyper-flow-split-arrow" aria-hidden="true">↓</div>

            <div class="hyper-flow-branches">
              <svg class="hyper-flow-return-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path class="hyper-return-line" d="M36 88 C37 88, 37.5 86, 37.5 83 L37.5 19 C37.5 16, 38.5 15, 40 15"></path>
                <path class="hyper-return-tip" d="M40 13.7 L42 15 L40 16.3 Z"></path>
              </svg>
              <div class="hyper-flow-branch">
                <section class="hyper-flow-card hyper-flow-heading">Assess minute ventilation<br>Ensure adequate tidal volumes</section>
                <div class="hyper-flow-arrow" aria-hidden="true">↓</div>
                <section class="hyper-flow-card hyper-flow-heading">Reverse known drug-induced depression of respiratory rate</section>
                <div class="hyper-flow-arrow" aria-hidden="true">↓</div>
                <section class="hyper-flow-card hyper-flow-detail-card">Opioids, benzodiazepines; turn off inhaled halogenated agents</section>
              </div>

              <div class="hyper-flow-branch machine-branch">
                <section class="hyper-flow-card hyper-flow-heading">Check anesthesia machine</section>
                <div class="hyper-machine-options">
                  <section class="hyper-flow-card">Check fresh gas circuit</section>
                  <section class="hyper-flow-card absorbent-option">Check absorbent <span>CO<sub>2</sub> agent</span></section>
                  <section class="hyper-flow-card">Check expiratory valve</section>
                </div>
                <div class="hyper-flow-arrow" aria-hidden="true">↓</div>
                <section class="hyper-flow-card hyper-flow-temperature">
                  <div class="hyper-flow-heading">Check temperature</div>
                  <div>If suspect <strong class="mh-emphasis">MH</strong>, go to
                    <button class="manual-case-link" type="button" data-open-protocol="mh-adult-ped-dosing">CHKLST 23-MH</button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
        <aside class="section-card section-reference hypercapnia-differential">
          <div class="section-header">Differential</div>
          <div class="section-body">
            ${differential.map((item) => `<div class="anaphylaxis-line prompt">${escapeHtml(item)}</div>`).join("")}
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderVfVtCase(protocol) {
  return `
    <div class="vfvt-case-wrap">
      <header class="vfvt-context-header">
        <div class="vfvt-title-row">
          <span class="vfvt-slide-number">1</span>
          <h2>${escapeHtml(protocol.title)}</h2>
          <div class="vfvt-rhythm-strips" aria-label="VF and VT rhythm examples">
            <div class="rhythm-strip"><b>VF</b><svg viewBox="0 0 150 38" role="img" aria-label="Ventricular fibrillation rhythm"><polyline points="0,29 3,8 6,31 9,5 12,28 15,11 18,34 21,6 24,26 27,13 30,32 33,7 36,25 39,12 42,31 45,9 48,27 51,14 54,33 57,8 60,26 63,11 66,30 69,13 72,34 75,7 78,25 81,12 84,31 87,9 90,27 93,14 96,33 99,8 102,26 105,11 108,30 111,13 114,34 117,7 120,25 123,12 126,31 129,9 132,27 135,14 138,33 141,8 144,26 147,11 150,29" /></svg></div>
            <div class="rhythm-strip"><b>VT</b><svg viewBox="0 0 150 38" role="img" aria-label="Ventricular tachycardia rhythm"><polyline points="0,28 7,5 15,9 22,31 30,28 37,5 45,9 52,31 60,28 67,5 75,9 82,31 90,28 97,5 105,9 112,31 120,28 127,5 135,9 142,31 150,28" /></svg></div>
          </div>
        </div>
        <p>${escapeHtml(protocol.summary)}</p>
      </header>
    <section class="vfvt-sheet" aria-label="Adult VF and VT cardiac arrest checklist">
      <div class="vfvt-left">
        <div class="vfvt-start">START</div>
        <div class="vfvt-checklist">
          <div class="vfvt-step">1 Call for help and a code cart</div>
          <div class="vfvt-chevron">Ask: “Who will be the crisis manager”?</div>
          <div class="vfvt-chevron">Say: “Shock patient as soon as defibrillator arrives”</div>
          <div class="vfvt-chevron">Call: “Initiate Transfer Protocol”</div>
          <div class="vfvt-step">2 Put backboard under patient, supine</div>
          <div class="vfvt-step">3 Turn FiO<sub>2</sub> to 100%, turn off volatile anesthetics</div>
          <div class="vfvt-step">4 Start CPR – defibrillation – assessment cycle</div>
          <div class="vfvt-chevron">Perform CPR</div>
          <div class="vfvt-bullet">“Hard and fast” 100-120 compressions/min to depth of 2-2.3 inches</div>
          <div class="vfvt-bullet">Ensure full chest recoil with minimal interruptions</div>
          <div class="vfvt-bullet">10 breaths/min, do not over-ventilate</div>
          <div class="vfvt-chevron">Defibrillate</div>
          <div class="vfvt-bullet">Shock at highest setting (200J biphasic in defibrillator mode)</div>
          <div class="vfvt-bullet">Resume CPR immediately after shock</div>
          <div class="vfvt-chevron">Give epinephrine</div>
          <div class="vfvt-bullet">Repeat epinephrine every 3-5 min</div>
          <div class="vfvt-chevron">Consider antiarrhythmics for refractory VF/VT (amiodarone)</div>
          <div class="vfvt-chevron">Assess every 2 minutes</div>
          <div class="vfvt-bullet">Change CPR compression provider</div>
          <div class="vfvt-bullet">Check ETCO<sub>2</sub></div>
          <div class="vfvt-subbullet">If &lt;10mmHg: evaluate CPR technique</div>
          <div class="vfvt-subbullet">If suddenly &gt;40mmHg: may indicate ROSC</div>
          <div class="vfvt-bullet">Treat reversible causes, consider reading aloud Hs and Ts (see list on right)</div>
          <div class="vfvt-bullet">Check rhythm; if rhythm organized, check pulse</div>
          <div class="vfvt-subbullet">If VF/VT continues:</div>
          <div class="vfvt-deep">Resume CPR – defibrillation – assessment cycle (restart step 4)</div>
          <div class="vfvt-subbullet">If asystole/PEA:</div>
          <div class="vfvt-deep">Resume CPR</div>
          <div class="vfvt-deep">Go to <button class="manual-case-link" type="button" data-open-protocol="acls-cardiac-arrest-asystole-pea">CHKLST 2-Asystole/PEA</button></div>
        </div>
      </div>

      <div class="vfvt-right">
        <section class="vfvt-panel vfvt-drugs">
          <h3>DRUG DOSES <span>and treatments ADULT</span></h3>
          <div class="vfvt-panel-body">
            <div class="vfvt-dose-row"><b>Epinephrine:</b><span>1mg IV, repeat every 3-5 min</span></div>
            <div class="vfvt-subtitle">ANTIARRHYTHMICS</div>
            <div class="vfvt-dose-row"><b>Amiodarone:</b><span>1<sup>st</sup> dose: 300mg/IV/IO<br>2<sup>nd</sup> dose: 150mg/IV/IO</span></div>
            <div class="vfvt-dose-row"><b>Magnesium:</b><span>1 to 2 g IV/IO for TdP</span></div>
          </div>
        </section>

        <section class="vfvt-panel vfvt-defib">
          <h3>DEFIBRILLATOR <span>instructions</span></h3>
          <div class="vfvt-panel-body vfvt-instructions">
            <div>1 Place electrodes on chest</div>
            <div>2 Turn defibrillator ON, set to DEFIB mode, and increase ENERGY LEVEL to highest setting</div>
            <div>3 Deliver shock: press CHARGE, then SHOCK</div>
          </div>
        </section>

        <section class="vfvt-panel vfvt-causes">
          <h3>Hs and Ts: Reversible Causes</h3>
          <div class="vfvt-cause-grid">
            <div>Hydrogen ions (acidosis)<br>Hyperkalemia<br>Hypothermia<br>Hypovolemia<br>Hypoxia</div>
            <div>Tamponade (cardiac)<br>Tension pneumothorax<br>Thrombosis (coronary/pulmonary)<br>Toxin (local anesthetic, beta<br>blocker, calcium channel blocker)</div>
          </div>
        </section>

        <section class="vfvt-panel vfvt-during">
          <h3>During CPR</h3>
          <div class="vfvt-panel-body vfvt-during-body">
            <b>Airway:</b><span>Bag-mask sufficient (if ventilation adequate)</span>
            <b>Circulation:</b><span>Confirm adequate IV/IO access<br>Consider IV fluids wide open<br>Consider ECMO for select potentially reversible causes</span>
            <b>Assign roles:</b><span>Chest compression, Airway, Vascular access, Timing,<br>cart, Documentation</span>
          </div>
        </section>
      </div>
    </section>
    </div>
  `;
}

function renderSearch() {
  app.innerHTML = `
    <div class="page-stack">
      <section class="card">
        <form class="search-form" id="site-search-form">
          <input class="search-bar" id="site-search" placeholder="Search case name, symptom, medication, or concern..." value="${escapeHtml(state.searchQuery)}" />
          <button class="button-link search-submit" type="submit">Search</button>
        </form>
        <p class="muted">Try natural phrases like “patient just desaturated”, “patient is bleeding”, or “someone has a knife”.</p>
      </section>
      <section class="card" id="search-results">
      </section>
    </div>
  `;
  renderSearchResults();
  document.querySelector("#site-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.searchQuery = document.querySelector("#site-search")?.value ?? "";
    syncHash();
    renderSearchResults();
  });
}

function renderManual() {
  app.innerHTML = `
    <div class="page-stack">
      <section class="card">
        <h2>Office-Based Emergency Manual</h2>
        <p class="muted">Open the original PDF manual or continue browsing the structured case library on the web.</p>
        <div class="manual-actions">
          <a class="button-link" href="./assets/office-based-emergency-manual.pdf" target="_blank" rel="noreferrer">Open Original PDF</a>
          <button class="button-link" data-route="categories">Browse Case Library</button>
        </div>
      </section>
      <section class="card">
        <h2>Included Sections</h2>
        <div class="pill-wrap">
          ${[
            ["Critical Events", "critical-events"],
            ["ACLS", "acls"],
            ["PALS", "pals"],
            ["Emergency", "emergency"],
            ["Administrative", "administrative"]
          ].map(([label, category]) => `
            <button class="pill" data-open-category="${category}">
              ${escapeHtml(label)}
            </button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function render() {
  syncHash();
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.route === state.route);
  });

  if (state.route === "home") renderHome();
  if (state.route === "categories") renderCategories();
  if (state.route === "search") renderSearch();
  if (state.route === "manual") renderManual();

  bindProtocolCards(app);

  app.querySelectorAll("[data-open-category]").forEach((element) => {
    element.addEventListener("click", () => {
      state.selectedCategory = element.dataset.openCategory;
      state.route = "categories";
      const first = protocols.find((protocol) => protocol.category === state.selectedCategory);
      if (first) state.selectedProtocolId = first.id;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  app.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => {
      state.route = element.dataset.route;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.route = button.dataset.route;
    render();
  });
});

window.addEventListener("hashchange", () => {
  loadHash();
  render();
});

loadHash();
render();
