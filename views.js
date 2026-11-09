import { addTo, candidates, compareText, confirmedSources, groupBy, institutions, rankBy, research,
  roleLabel, schoolComparison, series, venueFilter } from "./analysis.js?v=20261109.1";
import { actionText, bars, button, chart, checkbox, choices, csvButton, el, externalLink, format,
  grid, heatmap, hint, kpis, labeled, panel, select } from "./ui.js?v=20261109.1";

const top = (counts, limit = Infinity) => [...counts].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0])).slice(0, limit);
const schoolsInKorea = model => [...model.schools].filter(([, country]) => country === "kr").map(([name]) => name).sort(compareText);
const total = values => [...values].reduce((sum, n) => sum + n, 0);
const dateText = value => value?.replace("T", " ").slice(0, 19) ?? "—";
const years = filter => `${filter.start}–${filter.end}`;
const fieldLabels = model => model.fields.map(([code, title]) => [code, `${code} · ${title}`]);
const number = (value, min, max) => el("input", { type: "number", value, min, max });
const estimated = source => source == null ? "미상" : source.startsWith("est") ? `추정 · ${source}` : source;
const roles = ["국내 교수", "해외 교수", "박사과정 (추정)", "포닥 (추정)", "연구원·명단 외 교수 (추정)", "산업체", "미상"];
const regions = ["Korea", "United States", "China", "Europe", "Rest of Asia", "Other"];
const roleNames = { "KR faculty": "국내 교수", "faculty abroad": "해외 교수",
  "other · KR": "그 외 · 국내", "other · abroad": "그 외 · 해외", "other · unknown": "그 외 · 미상" };

function mainField(model, counts) {
  const order = model.fields.map(([field]) => field);
  return [...counts].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0] ?? ["—", 0];
}

export function schoolsView(model, filter, state) {
  const { domestic, byName, fieldRanks, domesticCounts, allowed } = institutions(model, filter);
  const careerVenues = venueFilter(model, { ...filter, fields: [], areas: [], venues: [] });
  const names = schoolsInKorea(model);
  if (!names.length) return hint("국내 기관 데이터가 없습니다.");
  const selected = names.includes(state.school) ? state.school : domestic[0]?.name ?? names[0];
  const profile = el("div");
  const control = select(names, selected, () => showSchool(control.value));
  const selectSchool = name => {
    control.value = name;
    showSchool(name);
    profile.scrollIntoView({ block: "start" });
  };

  function showSchool(name) {
    state.school = name;
    const row = byName.get(name);
    const field = state.schoolField ?? "";
    const memberRows = [];
    for (const [person, fields] of row?.members ?? []) {
      const [main, mainPapers] = mainField(model, fields);
      const target = field || main;
      if (field && !fields.has(field)) continue;
      const values = domesticCounts.get(target) ?? new Map();
      const papers = field ? fields.get(field) : mainPapers;
      const nationalRank = 1 + [...values.values()].filter(count => count > papers).length;
      const p = model.personByName.get(person);
      memberRows.push({ person, main, target, papers, total: total(fields.values()), nationalRank, nationalCount: values.size,
        academicAge: p?.academic_age, source: p?.age_source });
    }
    for (const group of groupBy(memberRows, member => member.target).values()) rankBy(group, member => member.papers);
    memberRows.sort((a, b) => model.fields.findIndex(([key]) => key === a.target) -
      model.fields.findIndex(([key]) => key === b.target) || a.rank - b.rank || compareText(a.person, b.person));

    const career = new Set((model.institutionFacultyByName.get(name) ?? [])
      .filter(([, , venue]) => careerVenues.has(venue)).map(([, person]) => person));
    const ages = [...career].map(person => model.personByName.get(person))
      .filter(person => person?.academic_age != null).sort((a, b) => a.academic_age - b.academic_age);
    const median = ages.length ? (ages[Math.floor((ages.length - 1) / 2)].academic_age + ages[Math.floor(ages.length / 2)].academic_age) / 2 : null;
    const bins = new Map();
    for (const p of ages) {
      const lower = Math.floor(p.academic_age / 3) * 3;
      if (!bins.has(lower)) bins.set(lower, { confirmed: 0, estimated: 0 });
      bins.get(lower)[confirmedSources.has(p.age_source) ? "confirmed" : "estimated"]++;
    }
    const trend = new Map();
    for (const [, venue, year, papers] of model.institutionByName.get(name) ?? []) {
      if (!allowed.has(venue) || year < Math.max(2000, filter.start - 15)) continue;
      const key = model.venues.get(venue).field;
      if (!trend.has(key)) trend.set(key, new Map());
      addTo(trend.get(key), year, papers);
    }
    const chooseField = select([["", "전체"], ...fieldLabels(model)], field, event => {
      state.schoolField = event.target.value;
      showSchool(name);
    });
    profile.replaceChildren(kpis([
      ["교수", `${format(row?.faculty ?? 0)}명`], [`논문 ${years(filter)}`, `${format(row?.papers ?? 0)}편`],
      ["세계 순위", row ? `${format(row.rank)}위` : "—"], ["세계 순위 · 교수 1인당", row?.rankPerFaculty ? `${format(row.rankPerFaculty)}위` : "—"],
      ["학문적 나이 중앙값", median == null ? "—" : `${format(median, 1)}년`],
    ]), el("div", { class: "split" },
      panel("연도별 논문 수", chart([...trend].map(([label, points]) => ({ label, points: [...points] })), "연도별 논문 수 · 분야별")),
      panel("교수 학문적 나이 분포", grid(["PhD 후 연수", "확인됨", "추정"], [...bins].sort((a, b) => a[0] - b[0]),
        ([year, counts]) => [`${year}–${year + 2}년`, counts.confirmed, counts.estimated]))),
    el("div", { class: "controls" }, labeled("교수 명단의 분야", chooseField)),
    grid(["주 분야", "분야 내 국내 순위", "분야 내 교내 순위", "이름", "분야 논문", "전체 분야 논문", "학문적 나이", "나이 출처"],
      memberRows, member => [member.main, `${member.nationalRank}위 / ${member.nationalCount}명`, member.rank,
        member.person, member.papers, member.total, member.academicAge, estimated(member.source)]));
  }

  showSchool(selected);
  const topSchools = [...domestic].sort((a, b) => total(b.fields.values()) - total(a.fields.values())).slice(0, 15).map(row => row.name);
  const columns = model.fields.map(([code]) => code);
  const pairCounts = new Map();
  const collabSchools = domestic.slice(0, 15).map(row => row.name);
  const collabSet = new Set(collabSchools);
  const pairKey = (a, b) => JSON.stringify(a < b ? [a, b] : [b, a]);
  for (const [a, b, venue, year, count] of model.collaboration) {
    if (!collabSet.has(a) || !collabSet.has(b) || !allowed.has(venue) || year < filter.start || year > filter.end) continue;
    addTo(pairCounts, pairKey(a, b), count);
  }
  return [
    panel("국내 기관 순위", hint(`${years(filter)} · 해당 기관 현재 교수가 저자로 참여한 고유 논문 수입니다. 기관명을 선택하면 교수 명단을 볼 수 있습니다.`),
      grid(["기관", "세계 순위 (논문 수)", "논문", "교수", "교수 1인당 논문", "세계 순위 (1인당)"], domestic,
        row => [actionText(row.name, () => selectSchool(row.name)), row.rank, row.papers, row.faculty, row.perFaculty, row.rankPerFaculty]),
      hint("1인당 순위는 해당 조건에서 활동 교수 3명 이상인 기관을 기준으로 계산합니다.")),
    panel("학교 프로필", labeled("학교", control), profile),
    panel("분야별 국내 순위",
      grid(["분야", "1위", "2위", "3위", "4위", "5위"], columns, field => {
        const schools = fieldRanks.get(field);
        return [field, ...Array.from({ length: 5 }, (_, i) => schools[i] && `${schools[i].rank}위 · ${schools[i].name} (${format(schools[i].papers)}편)`)];
      }),
      el("h3", {}, "학교별 분야 논문 수"),
      heatmap(topSchools, columns, (school, field) => byName.get(school).fields.get(field), "논문 수 상위 15개 국내 기관 × 분야"),
      el("h3", {}, "학교별 분야 구성"),
      heatmap(topSchools, columns, (school, field) => 100 * (byName.get(school).fields.get(field) ?? 0) /
        Math.max(1, total(byName.get(school).fields.values())), "학교별 분야 구성 (%)", 1)),
    panel("국내 기관 간 협업", heatmap(collabSchools, collabSchools,
      (a, b) => a === b ? null : pairCounts.get(pairKey(a, b)) ?? 0, "두 기관 교수가 함께 쓴 논문 수 · 논문 수 상위 15개 기관")),
  ];
}

export function peopleView(model, filter, getResearch) {
  const result = getResearch(filter);
  const ranking = institutions(model, filter);
  const all = model.people.filter(person => person.is_korean);
  const known = all.filter(person => person.region);
  const overseas = all.filter(person => person.role === "faculty abroad");
  const regionCounts = new Map();
  const affiliations = new Map();
  const ageBins = new Map();
  for (const p of all) {
    if (p.region) {
      addTo(regionCounts, p.region);
      addTo(affiliations, `${p.region} · ${p.affiliation ?? "(소속 미상)"}`);
    }
    if (p.academic_age == null) continue;
    const low = -5 + 2 * Math.floor((Math.max(-5, Math.min(44, p.academic_age)) + 5) / 2);
    if (!ageBins.has(low)) ageBins.set(low, new Map());
    addTo(ageBins.get(low), p.role);
  }
  const where = el("div");
  const drawWhere = n => where.replaceChildren(bars(top(affiliations, n), "현재 소속별 연구자 수"));
  const limit = select([30, 70, 100, 150], "70", event => drawWhere(Number(event.target.value)));
  drawWhere(70);

  const flows = new Map(model.mobility.map(row => [`${row.start_grp}|${row.now_grp}`, row.people]));
  const stages = ["박사 전 (추정)", "0–4년", "5–9년", "10–19년", "20년+"];
  const stageOf = age => stages[age < 0 ? 0 : age < 5 ? 1 : age < 10 ? 2 : age < 20 ? 3 : 4];
  const location = select([["all", "전체"], ["abroad", "해외만"], ["kr", "국내만"]], "all", drawTalent);
  const exclude = checkbox("국내 교수 제외 (영입 후보만)", true, drawTalent);
  const talent = el("div");
  function drawTalent() {
    const counts = new Map();
    for (const p of all) {
      if (p.academic_age == null || !result.stats.has(p.name)) continue;
      if (exclude.firstChild.checked && p.role === "KR faculty") continue;
      if (location.value === "abroad" && (!p.country || p.country === "kr")) continue;
      if (location.value === "kr" && p.country !== "kr") continue;
      const [field] = mainField(model, result.stats.get(p.name).fields);
      addTo(counts, `${field}|${stageOf(p.academic_age)}`);
    }
    talent.replaceChildren(heatmap(model.fields.map(([field]) => field), stages,
      (field, stage) => counts.get(`${field}|${stage}`) ?? 0, "주 분야 × 학문적 나이"));
  }
  drawTalent();

  const firstTwo = ranking.domestic.slice(0, 2).map(school => school.name);
  const emphasis = choices("강조할 학교 (최대 4)", schoolsInKorea(model), firstTwo);
  const output = el("div");
  const rawDomestic = model.people.filter(p => p.role === "KR faculty" && p.academic_age != null);
  const countFor = new Map();
  for (const school of ranking.domestic) for (const [name, fields] of school.members) countFor.set(name, total(fields.values()));
  function drawScatter() {
    const highlight = emphasis.values().slice(0, 4);
    const groups = groupBy(rawDomestic, p => highlight.includes(p.affiliation) ? p.affiliation : "그 외");
    const traces = [...groups].map(([label, people]) => ({ label, color: label === "그 외" ? "#8494a4" : null,
      points: people.map(p => [p.academic_age, countFor.get(p.name) ?? 0, `${p.name} · ${p.affiliation ?? ""}`]) }));
    const byAge = groupBy(rawDomestic, p => p.academic_age);
    const ages = [...byAge.keys()].sort((a, b) => a - b);
    const medians = ages.map(age => {
      const ordered = byAge.get(age).map(p => countFor.get(p.name) ?? 0).sort((a, b) => a - b);
      return (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2;
    });
    output.replaceChildren(chart(traces, "학문적 나이 (x) · 논문 수 (y)", "scatter"),
      el("h3", {}, "학문적 나이별 논문 수 중앙값"),
      chart([{ label: "중앙값", points: ages.map((age, index) => [age, medians[index]]) }], "학문적 나이별 논문 수 중앙값"));
  }
  emphasis.node.addEventListener("change", drawScatter);
  drawScatter();

  const ranked = overseas.filter(p => result.stats.has(p.name)).map(p => {
    const s = result.stats.get(p.name);
    const [field, papers] = mainField(model, s.fields);
    const peers = ranking.domesticCounts.get(field) ?? new Map();
    const equivalent = 1 + [...peers.values()].filter(n => n > papers).length;
    return { ...p, ...s, field, fieldPapers: papers, equivalent, peers: peers.size };
  });
  const fieldGroups = groupBy(ranked, p => p.field);
  for (const group of fieldGroups.values()) rankBy(group, p => p.fieldPapers);
  return [
    kpis([["추적 중인 한국인 연구자", `${format(all.length)}명`], ["해외 소속 비율", known.length ?
      `${format(100 * known.filter(p => p.region !== "Korea").length / known.length)}%` : "—"],
    ["해외 교수 (CSrankings)", `${format(overseas.length)}명`], ["나이 확인 비율", all.length ?
      `${format(100 * all.filter(p => confirmedSources.has(p.age_source)).length / all.length)}%` : "—"]]),
    panel("지금 어디에 있나", hint("한국인 여부는 이름·공저를 바탕으로 추정합니다. 소속은 CSrankings 또는 OpenAlex 기준입니다."),
      grid(["지역", "연구자"], top(regionCounts), row => row), el("div", { class: "controls" }, labeled("기관 수", limit)), where),
    panel("학문적 나이 분포와 소속 이동",
      heatmap([...ageBins.keys()].sort((a, b) => a - b).map(String), Object.values(roleNames),
        (bin, label) => ageBins.get(Number(bin)).get(Object.keys(roleNames).find(key => roleNames[key] === label)) ?? 0,
        "학문적 나이 구간 (2년) × 구분 · 음수는 박사 전 추정"),
      el("h3", {}, "연구자 소속 지역 이동"),
      heatmap(regions, regions, (from, to) => flows.get(`${from}|${to}`) ?? 0, "첫 소속(행) → 최근 소속(열), 관측 간격 3년 이상")),
    panel("인재 풀 · 분야 × 경력 단계", el("div", { class: "row controls" }, labeled("위치", location), exclude), talent),
    panel("국내 교수 · 학문적 나이 대비 실적", hint(`${years(filter)} 논문 수를 학문적 나이(추정 포함)와 함께 표시합니다.`), emphasis.node, output),
    panel("해외 대학의 한국인 교수",
      grid(["주 분야", "해외 한국인 교수 순위", "국내 환산 순위", "이름", "소속", "주 분야 논문", "전체 분야 논문",
        "1저자", "마지막 저자", "피인용", "나이", "학문적 나이"],
      model.fields.flatMap(([field]) => fieldGroups.get(field) ?? []), row => [row.field, `${row.rank}위 / ${fieldGroups.get(row.field).length}명`,
        `${row.equivalent}위 / ${row.peers}명`, row.name, row.affiliation, row.fieldPapers, row.papers, row.first,
        row.last, row.cites, row.birth_year == null ? null : model.referenceYear - row.birth_year, row.academic_age])),
  ];
}

export function schoolComparisonView(model, filter, state) {
  const areaTitles = new Map([...model.venues.values()].map(venue => [venue.area, venue.area_title]));
  const country = select([["kr", "국내"], ["", "전 세계"]], state.country, draw);
  const metric = select([["papers", "절대값"], ["faculty", "교수 1인당"], ["share", "학교 내 비중 (%)"]], "papers", draw);
  const out = el("div");
  function draw() {
    state.country = country.value;
    const rows = schoolComparison(model, filter, state.country);
    const table = rows.slice(0, state.country ? 20 : 40);
    const forMatrix = table.slice(0, 20);
    const byName = new Map(forMatrix.map(row => [row.name, row]));
    const activeAreas = [...new Set(forMatrix.flatMap(row => [...row.byArea.keys()]))];
    const titles = new Map(activeAreas.map(area => [areaTitles.get(area), area]));
    out.replaceChildren(grid(["기관", "점수", "교수", "논문", "교수 1인당"], table,
      row => [row.name, row.score, row.faculty, row.papers, row.perFaculty]),
    el("div", { class: "controls" }, csvButton("schools.csv", ["institution", "score", "faculty", "papers", "per_faculty"],
      () => rows.map(row => [row.name, row.score, row.faculty, row.papers, row.perFaculty]))),
    el("h3", {}, "학교 × 분야"), labeled("값", metric),
    heatmap(forMatrix.map(row => row.name), [...titles.keys()], (name, title) => {
      const row = byName.get(name);
      const n = row.byArea.get(titles.get(title)) ?? 0;
      if (metric.value === "faculty") return n / row.faculty;
      if (metric.value === "share") return 100 * n / Math.max(1, total(row.byArea.values()));
      return n;
    }, "학교 × 세부 분야", metric.value === "papers" ? 0 : 1));
  }
  draw();
  return panel("학교 비교", labeled("국가", country),
    hint("학교 점수는 세부 분야별 (논문 수 + 1)의 기하평균입니다. 같은 학교 교수의 공저는 각자 한 편씩 셉니다."), out);
}

function personDetail(model, person, filter, allowed, addCompare) {
  const safeName = person.name.replace(/\s+\d{4}$/, "").trim();
  const nameQuery = encodeURIComponent(safeName);
  const scholarSearch = `https://scholar.google.com/citations?view_op=search_authors&hl=en&mauthors=${encodeURIComponent(`${safeName} ${person.affiliation ?? ""}`.trim())}`;
  const links = [externalLink("DBLP 검색", `https://dblp.org/search?q=${nameQuery}`), externalLink("Scholar 검색", scholarSearch)];
  if (person.homepage) links.push(externalLink("홈페이지", person.homepage));
  if (/^[A-Za-z0-9_-]{12}$/.test(person.scholarid ?? "")) {
    links.push(externalLink("Scholar 프로필", `https://scholar.google.com/citations?user=${person.scholarid}&hl=en`));
  }
  const papers = (model.paperByName.get(person.name) ?? []).filter(([, venue, year]) =>
    year >= filter.start && year <= filter.end && allowed.has(venue))
    .sort((a, b) => b[2] - a[2] || (b[6] ?? -1) - (a[6] ?? -1) || compareText(a[3] ?? "", b[3] ?? ""));
  const career = series(model, person.name, filter, true);
  const degrees = model.degrees.get(person.name) ?? [];
  return panel(person.name, hint(`${person.affiliation ?? "소속 미상"} · ${roleLabel(person)}`),
    el("div", { class: "row" }, links, button("비교에 추가", () => addCompare(person.name))),
    el("h3", {}, "선택 기간의 논문 목록"),
    grid(["연도", "학회", "분야", "제목", "저자 위치", "피인용", "DOI"], papers,
      ([, venue, year, title, pos, n, cites, doi]) => [year, venue.toUpperCase(), model.venues.get(venue).field,
        { value: title, class: "long" }, pos === 1 ? "1저자" : pos === n && n > 1 ? "마지막" : `${pos}/${n}`,
        cites, doi ? externalLink("열기", `https://doi.org/${doi}`) : null]),
    el("h3", {}, "학위·나이 근거"),
    grid(["학위", "연도", "기관", "출처", "근거"], degrees,
      d => [d.degree, d.year, d.institution, d.source, { value: d.evidence, class: "long" }]),
    grid(["PhD 연도 (추정 포함)", "나이 출처", "학문적 나이", "출생 연도", "출생 출처", "첫 대상 학회 논문"],
      [person], p => [p.phd_year_eff, estimated(p.age_source), p.academic_age, p.birth_year, estimated(p.birth_source), p.first_top_year]),
    el("div", { class: "split controls" },
      panel("분야별 논문 수 · 전체 경력", bars(top(career.byArea), "분야별 논문 수")),
      panel("연도별 논문 수 · 전체 경력", chart([{ label: person.name, points: [...career.byYear] }], "연도별 논문 수"))));
}

export function searchView(model, filter, state, getResearch, addCompare) {
  const term = el("input", { type: "search", placeholder: "이름 또는 기관", value: state.searchTerm ?? "" });
  const scope = select([["korean", "한국인 연구자 전체"], ["kr", "국내 교수"], ["world", "전 세계 교수"]], state.scope ?? "korean");
  const role = select([["", "전체"], ...roles], "");
  const loc = select([["all", "전체"], ["kr", "국내"], ["abroad", "해외"]], "all");
  const affiliation = select([["", "전체"], ...[...new Set(model.people.map(p => p.affiliation).filter(Boolean))].sort(compareText)], "");
  const ageMin = number("", -20, 90);
  const ageMax = number("", -20, 90);
  const min = number(0, 0, 200);
  const window = number(2, 1, 5);
  const order = select([["papers", "논문 수"], ["cites", "피인용"], ["percentile", "같은 나이대 백분위"]], "papers");
  const confirmed = checkbox("확인된 나이만", false);
  const fields = choices("검색에만 적용할 분야", fieldLabels(model));
  const out = el("div");
  const details = el("div");
  const form = el("form", { onsubmit: event => {
    event.preventDefault();
    draw();
  } }, el("div", { class: "filters" },
    labeled("이름 또는 기관 검색", term), labeled("검색 범위", scope), labeled("구분", role), labeled("소속 위치", loc),
    labeled("소속", affiliation), labeled("학문적 나이 최소", ageMin), labeled("학문적 나이 최대", ageMax),
    labeled("최소 논문 수", min), labeled("코호트 ±년", window), labeled("순위 기준", order), fields.node, confirmed),
  el("div", { class: "controls" }, el("button", { type: "submit", class: "primary" }, "검색")));
  const headers = ["순위", "이름", "소속", "구분", "소속 연도", "나이", "학문적 나이", "PhD", "출생 연도", "논문", "1저자",
    "마지막 저자", "피인용", "피인용 (경력)", "백분위", "코호트", "나이 출처"];
  function draw() {
    state.searchTerm = term.value.trim();
    state.scope = scope.value;
    const searchFields = fields.values();
    const searchFilter = searchFields.length ? { ...filter, fields: searchFields, areas: [], venues: [] } : filter;
    const results = getResearch(searchFilter);
    const cohortWindow = Math.min(5, Math.max(1, Number(window.value) || 2));
    const rows = candidates(model, results, {
      term: state.searchTerm, scope: scope.value, role: role.value, location: loc.value, affiliation: affiliation.value,
      ageMin: ageMin.value === "" ? null : Number(ageMin.value), ageMax: ageMax.value === "" ? null : Number(ageMax.value),
      minPapers: Number(min.value), window: cohortWindow, sort: order.value, confirmed: confirmed.firstChild.checked,
    });
    const show = person => {
      details.replaceChildren(personDetail(model, person, searchFilter, results.allowed, addCompare));
      details.scrollIntoView({ block: "start" });
    };
    out.replaceChildren(hint(`${format(rows.length)}명 · ${years(filter)} · 백분위는 국내 교수 중 학문적 나이 ±${cohortWindow}년 집단 기준입니다.`),
      grid(headers, rows, row => [row.rank, actionText(row.name, () => show(row)), row.affiliation, roleLabel(row), row.affil_year,
        row.age, row.academic_age, row.phd_year, row.birth_year, row.papers, row.first, row.last, row.cites, row.cites_all,
        row.percentile, row.cohort, estimated(row.age_source)]),
      el("div", { class: "controls" }, csvButton("candidates.csv",
        ["name", "institution", "role", "papers", "first_author", "last_author", "citations"],
        () => rows.map(row => [row.name, row.affiliation, roleLabel(row), row.papers, row.first, row.last, row.cites]))));
    details.replaceChildren();
  }
  draw();
  return [panel("교수·후보자 검색", form, out), details];
}

export function compareView(model, filter, state) {
  const entry = el("input", { type: "search", placeholder: "이름 또는 기관" });
  const result = select([], "", undefined);
  const status = el("p", { class: "hint", "aria-live": "polite" });
  const out = el("div");
  const find = () => {
    const term = entry.value.trim().toLocaleLowerCase();
    const hits = term ? model.people.filter(p => `${p.name} ${p.affiliation ?? ""}`.toLocaleLowerCase().includes(term)).slice(0, 100) : [];
    result.replaceChildren(el("option", { value: "" }, hits.length ? "선택하세요" : "검색 결과 없음"), ...hits.map(p =>
      el("option", { value: p.name }, `${p.name} · ${p.affiliation ?? "소속 미상"}`)));
  };
  entry.addEventListener("input", find);
  find();
  function draw() {
    const selected = state.comparison.map(name => model.personByName.get(name)).filter(Boolean);
    if (!selected.length) {
      out.replaceChildren(hint("비교할 연구자를 최대 4명까지 추가하세요."));
      return;
    }
    const results = selected.map(p => ({ p, selected: series(model, p.name, filter), career: series(model, p.name, filter, true) }));
    const areas = [...new Set(results.flatMap(row => [...row.selected.byArea.keys()]))].sort(compareText);
    const known = [];
    const unknown = [];
    for (const row of results) {
      let count = 0;
      const origin = row.p.phd_year_eff;
      const points = [...row.career.byYear].sort((a, b) => a[0] - b[0]).map(([year, n]) => {
        count += n;
        return [origin == null ? year : year - origin, count];
      });
      (origin == null ? unknown : known).push({ label: row.p.name, points });
    }
    out.replaceChildren(el("div", { class: "row controls" }, selected.map(p =>
      button(`${p.name} 제거`, () => {
        state.comparison = state.comparison.filter(name => name !== p.name);
        draw();
      }))),
    grid(["이름", "학문적 나이", "나이 출처", `논문 ${years(filter)}`], results,
      row => [row.p.name, row.p.academic_age, estimated(row.p.age_source), total(row.selected.byYear.values())]),
    el("h3", {}, "분야별 논문 수"), heatmap(areas, selected.map(p => p.name),
      (area, name) => results.find(row => row.p.name === name).selected.byArea.get(area) ?? 0, "분야별 논문 수"),
    known.length > 0 && el("div", {}, el("h3", {}, "누적 논문 수 · PhD 후 연차"), chart(known, "PhD 후 연차 기준 누적 논문 수")),
    unknown.length > 0 && el("div", {}, el("h3", {}, "누적 논문 수 · 출판 연도"), chart(unknown, "출판 연도 기준 누적 논문 수")));
  }
  draw();
  const add = () => {
    if (!result.value || state.comparison.includes(result.value)) return;
    if (state.comparison.length >= 4) {
      status.textContent = "최대 4명까지 비교할 수 있습니다.";
      return;
    }
    state.comparison.push(result.value);
    status.textContent = `${result.value} 추가됨`;
    draw();
  };
  return panel("교수 비교", el("div", { class: "row controls" }, labeled("연구자 검색", entry), labeled("검색 결과", result), button("추가", add)), status, out);
}

export function statusView(model) {
  return [
    panel("스냅샷", grid(["출처", "버전", "수집 일시"], model.snapshots, row => [row.source, row.version, dateText(row.fetched_at)])),
    panel("국내 교수 학문적 나이 출처", grid(["출처", "교수"], model.coverage, row => [estimated(row.source), row.faculty])),
    panel("수집 로그", grid(["출처", "상태", "건수", "최근 수집"], model.logs,
      row => [row.source, row.status, row.n, dateText(row.last)])),
  ];
}

export const makeResearch = model => {
  let key;
  let previous;
  return filter => {
    const next = JSON.stringify(filter);
    if (next !== key) {
      previous = research(model, filter);
      key = next;
    }
    return previous;
  };
};
