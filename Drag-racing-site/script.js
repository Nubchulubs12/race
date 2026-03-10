
const $ = (id) => document.getElementById(id);

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function litersToCID(L) { return L * 61.0237441; }

function showWarn(msg) {
  const el = $("warn");
  if (!msg) { el.style.display = "none"; el.textContent = ""; return; }
  el.style.display = "block";
  el.textContent = msg;
}

//  Mode (Stock) 
let mode = "stock";

function setMode(next) {
  mode = next;

  $("btnStock").classList.toggle("active", mode === "stock");
  $("btnCustom").classList.toggle("active", mode === "custom");

  // disable/enable all custom-only sections
  document.querySelectorAll('[data-custom-only="true"]').forEach(section => {
    const isCustom = mode === "custom";
    section.classList.toggle("disabledBlock", !isCustom);
    section.querySelectorAll("input, select, button").forEach(el => {
      el.disabled = !isCustom;
    });
  });

  if (mode === "stock") {
    
    clearCustomSelections();
  }

  updateHelpText();
  showWarn("");
}

$("btnStock").addEventListener("click", () => setMode("stock"));
$("btnCustom").addEventListener("click", () => setMode("custom"));

//  Selection limits 
function wireGroupLimits() {
  document.querySelectorAll(".checks").forEach(group => {
    const max = Number(group.dataset.max || "1");
    const boxes = Array.from(group.querySelectorAll('input[type="checkbox"]'));

    boxes.forEach(box => {
      box.addEventListener("change", () => {
        if (!box.checked) { updateHelpText(); return; }

        const checked = boxes.filter(b => b.checked);

        if (max === 1 && checked.length > 1) {
          // uncheck all others
          boxes.forEach(b => { if (b !== box) b.checked = false; });
        }

        if (max === 2 && checked.length > 2) {
          // prevent the newest selection from exceeding 2
          box.checked = false;
          showWarn("Exhaust: pick up to 2 options.");
          setTimeout(() => showWarn(""), 1400);
        }

        updateHelpText();
      });
    });
  });
}

function clearCustomSelections() {
  document.querySelectorAll('[data-custom-only="true"] input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });
}


const CAM_HELP = {
  stage1: "Stage 1: mild/stock replacement. Smooth idle, better low-end efficiency.",
  stage2: "Stage 2: street/strip balance. More mid/top power, noticeable idle.",
  stage3: "Stage 3: aggressive. High RPM focus, supports lopey/choppy idle with supporting mods.",
  stage4: "Stage 4+: full race/drag. Top-end power priority, drivability takes a hit."
};

const HEADS_HELP = {
  h1: "Heads stage 1: ported heads. Better airflow, still very streetable.",
  h2: "Heads stage 2: bigger valves + porting. Stronger support for higher RPM power.",
  h3: "Heads stage 3: full porting / high lift / big valves. Built to support big cam & high RPM."
};

function getSelectedValue(groupName) {
  const group = document.querySelector(`.checks[data-group="${groupName}"]`);
  if (!group) return null;
  const checked = group.querySelector('input[type="checkbox"]:checked');
  return checked ? checked.value : null;
}

function getSelectedValues(groupName) {
  const group = document.querySelector(`.checks[data-group="${groupName}"]`);
  if (!group) return [];
  return Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map(x => x.value);
}

function updateHelpText() {
  const cam = getSelectedValue("cam");
  const heads = getSelectedValue("heads");
  $("camHelp").textContent = cam ? CAM_HELP[cam] || "" : "";
  $("headsHelp").textContent = heads ? HEADS_HELP[heads] || "" : "";
}

//Math models

// Stock base ranges (NA, crank hp/CID)
const BASE_RANGE_STOCK = [1.08, 1.20];

// RPM 
function rpmFactor(rpm) {
  const lo = 4500;
  const hi = 7500;
  const r = clamp(rpm, lo, hi);
  return (r - lo) / (hi - lo);
}

function lerp(a, b, t) { return a + (b - a) * t; }


const MULT = {
  exhaust: {
    shorty: 1.02,
    longtube: 1.12,
    catback: 1.03
  },
  intake: {
    cai: 1.03,
    portedIntake: 1.08
  },
  tb: {
    "75": 1.03,
    "80": 1.04,
    "85": 1.05,
    "90": 1.06
  },
  cam: {
    stage1: 1.05,
    stage2: 1.10,
    stage3: 1.15,
    stage4: 1.20
  },
  cr: {
    "9.1": 1.00,
    "10.0": 1.05,
    "11.0": 1.08,
    "12.0": 1.13
  },
  heads: {
    h1: 1.08,
    h2: 1.012,
    h3: 1.16
  }
};


const CUSTOM_TUNE_MULT = 1.0;

function computeCrankHp(cid, rpm) {
  const t = rpmFactor(rpm);
  let hpPerCid = lerp(BASE_RANGE_STOCK[0], BASE_RANGE_STOCK[1], t);

  
  if (mode === "custom") {
    let m = 1.05;

    
    const ex = getSelectedValues("exhaust");
    ex.forEach(v => { m *= (MULT.exhaust[v] || 1.03); });

    
    const intake = getSelectedValue("intake");
    ex.forEach(v => { m *= (MULT.intake[v] || 1.03); });

    const tb = getSelectedValue("tb");
    const cam = getSelectedValue("cam");
    const cr = getSelectedValue("cr");
    const heads = getSelectedValue("heads");

    if (intake) m *= (MULT.intake[intake] || 1.03);
    if (tb) m *= (MULT.tb[tb] || 1.03);
    if (cam) m *= (MULT.cam[cam] || 1.03);
    if (cr) m *= (MULT.cr[cr] || 1.03);
    if (heads) m *= (MULT.heads[heads] || 1.03);

    
    m *= CUSTOM_TUNE_MULT;

    
    m = clamp(m, 1.0, 1.75);

    hpPerCid *= m;
  }

  return cid * hpPerCid;
}

function wheelHpFromCrank(crank, lossPct) {
  const loss = clamp(lossPct, 0, 50) / 100;
  return crank * (1 - loss);
}

function torqueAtRpm(crankHp, rpm) {
  return (crankHp * 5252) / rpm;
}


$("lossSlider").addEventListener("input", () => {
  $("lossPctText").textContent = `${fmt(Number($("lossSlider").value), 1)}%`;
});


$("calcBtn").addEventListener("click", () => {
  showWarn("");

  $("crankHpOut").textContent = "—";
  $("wheelHpOut").textContent = "—";
  $("torqueOut").textContent = "—";

  const dispVal = Number($("dispVal").value);
  const dispUnit = $("dispUnit").value;
  const rpm = Number($("peakRpm").value);
  const lossPct = Number($("lossSlider").value);

  if (!dispVal || dispVal <= 0) return showWarn("Enter a valid engine displacement.");
  if (!rpm || rpm <= 0) return showWarn("Enter a valid RPM at peak power.");

  const cid = (dispUnit === "L") ? litersToCID(dispVal) : dispVal;

  const chp = computeCrankHp(cid, rpm);
  const whp = wheelHpFromCrank(chp, lossPct);
  const tq = torqueAtRpm(chp, rpm);

  $("crankHpOut").textContent = `${fmt(chp, 0)} hp`;
  $("wheelHpOut").textContent = `${fmt(whp, 0)} whp`;
  $("torqueOut").textContent = `${fmt(tq, 0)} lb-ft`;
});


wireGroupLimits();
updateHelpText();
$("lossPctText").textContent = `${fmt(Number($("lossSlider").value), 1)}%`;
setMode("stock");