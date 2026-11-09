import { compareText, prepare } from "./analysis.js?v=20261109.1";
import { readSnapshot } from "./snapshot.js?v=20261109.1";
import { button, checkbox, choices, el, hint, labeled } from "./ui.js?v=20261109.1";
import { compareView, makeResearch, peopleView, schoolComparisonView, schoolsView, searchView, statusView } from "./views.js?v=20261109.1";

const dashboard = document.querySelector("#dashboard");
const edition = document.querySelector("#edition");
const status = document.querySelector("#loading");

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

async function open() {
  try {
    const response = await fetch("./faculty-performance.json.gz", { cache: "no-cache", credentials: "omit" });
    if (!response.ok) throw new Error("Snapshot download failed");
    const snapshot = await readSnapshot(response.body);
    mountDashboard(prepare(snapshot));
    const timestamp = new Date(snapshot.exportedAt);
    edition.textContent = Number.isNaN(timestamp.getTime()) ? "스냅샷" :
      `스냅샷 · ${timestamp.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}`;
    dashboard.hidden = false;
    status.hidden = true;
  } catch {
    dashboard.replaceChildren();
    status.textContent = "대시보드를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.";
  }
}

open();
