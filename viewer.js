import { compareText, prepare } from "./analysis.js";
import { unlockSnapshot } from "./snapshot.js";
import { button, checkbox, choices, el, hint, labeled } from "./ui.js";
import { compareView, makeResearch, peopleView, schoolComparisonView, schoolsView, searchView, statusView } from "./views.js";

const gate = document.querySelector("#gate");
const dashboard = document.querySelector("#dashboard");
const edition = document.querySelector("#edition");
const status = document.querySelector("#gate-status");
const form = document.querySelector("#unlock-form");
const keyInput = document.querySelector("#share-key");
const fileInput = document.querySelector("#snapshot-file");
const lockButton = document.querySelector("#lock");
const openButton = form.querySelector("button");
const lookupKey = value => {
  const text = value.trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(text)) return text;
  try {
    return new URLSearchParams(new URL(text).hash.slice(1)).get("key");
  } catch {
    return null;
  }
};

function mountDashboard(model) {
  const state = {
    view: "schools", explorer: "schoolComparison", comparison: [], country: "kr",
    filter: { start: model.referenceYear - 9, end: model.referenceYear, fields: [], areas: [], venues: [], expanded: false },
  };
  const navigation = el("nav", { class: "tabs", "aria-label": "대시보드" });
  const body = el("div");
  const filters = el("form", { class: "panel", "aria-label": "논문 필터" });
  const filterStatus = el("p", { class: "hint", role: "status" });
  const heading = el("h1", {}, "국내 기관");
  const getResearch = makeResearch(model);
  const views = [["schools", "국내 기관"], ["people", "한국인 연구자"], ["explore", "검색 · 비교"]];
  const explorerViews = [["schoolComparison", "학교 비교"], ["search", "교수·후보자 검색"],
    ["compare", "교수 비교"], ["status", "데이터 현황"]];

  const start = el("input", { type: "number", min: 1900, max: model.referenceYear, value: state.filter.start, required: true });
  const end = el("input", { type: "number", min: 1900, max: model.referenceYear, value: state.filter.end, required: true });
  const fields = choices("분야", model.fields.map(([code, title]) => [code, `${code} · ${title}`]));
  const areaByCode = new Map([...model.venues.values()].map(venue => [venue.area, venue.area_title]));
  const areas = choices("세부 분야 (CSrankings)", [...areaByCode].sort((a, b) => compareText(a[1], b[1])));
  const venues = choices("학회 (선택 시 분야 무시)", [...model.venues.keys()].map(venue => [venue, venue.toUpperCase()]));
  const expanded = checkbox("확장 학회 포함", false);
  filters.append(el("div", { class: "filters" }, labeled("시작 연도", start), labeled("끝 연도", end),
    fields.node, areas.node, venues.node, expanded), el("div", { class: "row controls" },
    el("button", { type: "submit", class: "primary" }, "필터 적용"), filterStatus));
  filters.addEventListener("submit", event => {
    event.preventDefault();
    if (Number(start.value) > Number(end.value)) {
      filterStatus.textContent = "시작 연도는 끝 연도보다 늦을 수 없습니다.";
      return;
    }
    state.filter = {
      start: Number(start.value), end: Number(end.value), fields: fields.values(),
      areas: areas.values(), venues: venues.values(), expanded: expanded.firstChild.checked,
    };
    render();
  });

  function render() {
    const filter = state.filter;
    const activeView = views.find(([key]) => key === state.view)[1];
    heading.textContent = activeView;
    navigation.replaceChildren(...views.map(([key, label]) => button(label, () => {
      state.view = key;
      render();
      navigation.querySelector('[aria-current="page"]').focus();
    }, { "aria-current": key === state.view ? "page" : null })));
    const scope = filter.venues.length ? filter.venues.map(venue => venue.toUpperCase()).join(", ") :
      filter.areas.length ? filter.areas.map(area => areaByCode.get(area)).join(", ") : filter.fields.join(", ") || "전 분야";
    filterStatus.textContent = `${filter.start}–${filter.end} · ${scope} · ${filter.expanded ? "확장 학회 포함" : "주요 학회"}`;

    if (state.view === "schools") {
      body.replaceChildren(...schoolsView(model, filter, state));
      return;
    }
    if (state.view === "people") {
      body.replaceChildren(...peopleView(model, filter, getResearch));
      return;
    }
    const tabs = el("nav", { class: "tabs", "aria-label": "검색과 비교" }, explorerViews.map(([key, label]) =>
      button(label, () => {
        state.explorer = key;
        render();
        body.querySelector('[aria-current="page"]').focus();
      }, { "aria-current": key === state.explorer ? "page" : null })));
    const addCompare = name => {
      if (!state.comparison.includes(name)) {
        if (state.comparison.length === 4) {
          body.append(hint("비교에 추가하려면 기존 연구자 한 명을 먼저 제거하세요."));
          return;
        }
        state.comparison.push(name);
      }
      state.explorer = "compare";
      render();
      body.querySelector('[aria-current="page"]').focus();
    };
    const contents = {
      schoolComparison: () => schoolComparisonView(model, filter, state),
      search: () => searchView(model, filter, state, getResearch, addCompare),
      compare: () => compareView(model, filter, state),
      status: () => statusView(model),
    }[state.explorer]();
    body.replaceChildren(tabs, ...[contents].flat());
  }

  dashboard.replaceChildren(heading, navigation, filters, body);
  render();
}

function lock() {
  dashboard.replaceChildren();
  dashboard.hidden = true;
  gate.hidden = false;
  lockButton.hidden = true;
  edition.textContent = "암호화된 연구 실적 대시보드";
  form.reset();
  status.textContent = "대시보드를 닫았습니다.";
  keyInput.focus();
  window.scrollTo(0, 0);
}

let opening = false;
async function open(shareKey) {
  if (opening) return;
  if (!shareKey) {
    status.textContent = "열람 키가 포함된 공유 링크 또는 열람 키를 입력해 주세요.";
    return;
  }
  opening = true;
  openButton.disabled = true;
  status.textContent = "스냅샷을 불러오는 중입니다.";
  keyInput.value = "";
  try {
    const file = fileInput.files[0];
    if (file && file.size > 95 * 1024 * 1024) throw new Error("스냅샷 파일이 너무 큽니다.");
    let bytes;
    if (file) {
      bytes = await file.arrayBuffer();
    } else {
      const response = await fetch("./faculty-performance.snapshot", { cache: "no-store", credentials: "omit", redirect: "error" });
      if (response.status === 404) throw new Error("게시된 스냅샷이 없습니다. 암호화 스냅샷 파일을 직접 열 수 있습니다.");
      if (!response.ok) throw new Error("스냅샷을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.");
      bytes = await response.arrayBuffer();
    }
    status.textContent = "브라우저에서 스냅샷을 복호화하는 중입니다.";
    const snapshot = await unlockSnapshot(bytes, shareKey);
    mountDashboard(prepare(snapshot));
    const timestamp = new Date(snapshot.exportedAt);
    edition.textContent = Number.isNaN(timestamp.getTime()) ? "스냅샷" :
      `스냅샷 · ${timestamp.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}`;
    gate.hidden = true;
    dashboard.hidden = false;
    lockButton.hidden = false;
    const heading = dashboard.querySelector("h1");
    heading.tabIndex = -1;
    heading.focus();
  } catch (error) {
    dashboard.replaceChildren();
    status.textContent = error.message || "스냅샷을 열 수 없습니다.";
  } finally {
    opening = false;
    openButton.disabled = false;
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  open(lookupKey(keyInput.value));
});
lockButton.addEventListener("click", lock);

const fragment = new URLSearchParams(window.location.hash.slice(1));
if (fragment.has("key")) {
  history.replaceState(null, "", window.location.pathname + window.location.search);
  open(fragment.get("key"));
}
