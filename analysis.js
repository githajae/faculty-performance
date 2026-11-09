export const confirmedSources = new Set(["orcid", "homepage", "manual"]);
export const roleLabel = person => ({
  "KR faculty": "국내 교수", "faculty abroad": "해외 교수",
})[person.role] ?? person.stage ?? "미상";
export const compareText = (a, b) => a.localeCompare(b, "ko");

export function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

export function addTo(counts, key, amount = 1) {
  counts.set(key, (counts.get(key) ?? 0) + amount);
}

export function rankBy(rows, value, key = "rank") {
  rows.sort((a, b) => value(b) - value(a));
  let prior = null;
  let rank = 0;
  rows.forEach((row, index) => {
    if (value(row) !== prior) rank = index + 1;
    prior = value(row);
    row[key] = rank;
  });
  return rows;
}

function objects(table) {
  return table.rows.map(row => Object.fromEntries(table.columns.map((key, i) => [key, row[i]])));
}

export function prepare(data) {
  const t = data.tables;
  const people = objects(t.people);
  return {
    referenceYear: data.referenceYear,
    exportedAt: data.exportedAt,
    fields: data.fields,
    venues: new Map(objects(t.venues).map(venue => [venue.venue, venue])),
    schools: new Map(t.schools.rows),
    people,
    personByName: new Map(people.map(person => [person.name, person])),
    degrees: groupBy(objects(t.degrees), row => row.person),
    authors: t.authors.rows,
    authorByName: groupBy(t.authors.rows, row => row[0]),
    papers: t.papers.rows,
    paperByName: groupBy(t.papers.rows, row => row[0]),
    institutionPapers: t.institutionPapers.rows,
    institutionByName: groupBy(t.institutionPapers.rows, row => row[0]),
    institutionFaculty: t.institutionFaculty.rows,
    institutionFacultyByName: groupBy(t.institutionFaculty.rows, row => row[0]),
    schoolComparison: t.schoolComparison.rows,
    collaboration: t.collaboration.rows,
    mobility: objects(t.mobility),
    snapshots: objects(t.snapshots),
    coverage: objects(t.coverage),
    logs: objects(t.logs),
  };
}

export function venueFilter(model, filter) {
  return new Set([...model.venues.values()].filter(venue => {
    if (filter.venues.length) return filter.venues.includes(venue.venue);
    if (!filter.expanded && venue.next_tier) return false;
    if (filter.areas.length) return filter.areas.includes(venue.area);
    return !filter.fields.length || filter.fields.includes(venue.field);
  }).map(venue => venue.venue));
}

const inWindow = (year, filter) => year >= filter.start && year <= filter.end;
const fieldOf = (model, venue) => model.venues.get(venue).field;

export function institutions(model, filter) {
  const allowed = venueFilter(model, filter);
  const byName = new Map();
  for (const [name, venue, year, papers] of model.institutionPapers) {
    if (!allowed.has(venue) || !inWindow(year, filter)) continue;
    if (!byName.has(name)) byName.set(name, {
      name, country: model.schools.get(name), papers: 0, fields: new Map(), members: new Map(),
    });
    const school = byName.get(name);
    school.papers += papers;
    addTo(school.fields, fieldOf(model, venue), papers);
  }
  const domesticCounts = new Map();
  for (const [name, person, venue, year, papers] of model.institutionFaculty) {
    if (!allowed.has(venue) || !inWindow(year, filter)) continue;
    const school = byName.get(name);
    if (!school) continue;
    if (!school.members.has(person)) school.members.set(person, new Map());
    const field = fieldOf(model, venue);
    addTo(school.members.get(person), field, papers);
    if (school.country === "kr") {
      if (!domesticCounts.has(field)) domesticCounts.set(field, new Map());
      addTo(domesticCounts.get(field), person, papers);
    }
  }
  const worldwide = [...byName.values()].sort((a, b) => compareText(a.name, b.name));
  for (const school of worldwide) {
    school.faculty = school.members.size;
    school.perFaculty = school.faculty ? school.papers / school.faculty : 0;
  }
  rankBy(worldwide.filter(school => school.faculty >= 3), school => school.perFaculty, "rankPerFaculty");
  rankBy(worldwide, school => school.papers);
  const domestic = worldwide.filter(school => school.country === "kr");
  const fieldRanks = new Map(model.fields.map(([field]) => [field, rankBy(domestic
    .filter(school => school.fields.has(field))
    .map(school => ({ name: school.name, papers: school.fields.get(field) })), row => row.papers)]));
  return { allowed, domestic, byName, fieldRanks, domesticCounts };
}

export function schoolComparison(model, filter, country) {
  const allowed = venueFilter(model, filter);
  const byName = new Map();
  for (const [name, person, venue, year, papers] of model.schoolComparison) {
    if ((country && model.schools.get(name) !== country) || !inWindow(year, filter) || !allowed.has(venue)) continue;
    if (!byName.has(name)) byName.set(name, { name, faculty: new Set(), byArea: new Map() });
    const school = byName.get(name);
    school.faculty.add(person);
    addTo(school.byArea, model.venues.get(venue).area, papers);
  }
  const areas = filter.areas.length ? filter.areas : [...new Set([...model.venues.values()].map(venue => venue.area))];
  return [...byName.values()].map(school => {
    const faculty = school.faculty.size;
    const papers = areas.reduce((total, area) => total + (school.byArea.get(area) ?? 0), 0);
    const score = Math.exp(areas.reduce((total, area) => total + Math.log1p(school.byArea.get(area) ?? 0), 0) / areas.length);
    return { ...school, faculty, papers, score, perFaculty: papers / faculty };
  }).sort((a, b) => b.score - a.score || compareText(a.name, b.name));
}

export function research(model, filter) {
  const allowed = venueFilter(model, filter);
  const stats = new Map();
  const career = new Set();
  for (const [name, venue, year, papers, first, last] of model.authors) {
    if (!allowed.has(venue)) continue;
    career.add(name);
    if (!inWindow(year, filter)) continue;
    if (!stats.has(name)) stats.set(name, { papers: 0, first: 0, last: 0, cites: null, fields: new Map() });
    const row = stats.get(name);
    row.papers += papers;
    row.first += first;
    row.last += last;
    addTo(row.fields, fieldOf(model, venue), papers);
  }
  for (const [name, venue, year, , , , cites] of model.papers) {
    if (cites == null || !allowed.has(venue) || !inWindow(year, filter)) continue;
    const row = stats.get(name);
    if (row) row.cites = (row.cites ?? 0) + cites;
  }
  const cohorts = new Map();
  for (const person of model.people) {
    const age = person.academic_age;
    if (person.role !== "KR faculty" || age == null || !career.has(person.name)) continue;
    if (!cohorts.has(age)) cohorts.set(age, []);
    cohorts.get(age).push(stats.get(person.name)?.papers ?? 0);
  }
  for (const values of cohorts.values()) values.sort((a, b) => a - b);
  return { allowed, stats, cohorts };
}

function bound(values, value, upper) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < value || (upper && values[mid] === value)) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function percentile(cohorts, age, papers, window) {
  if (age == null) return { percentile: null, cohort: 0 };
  let score = 0;
  let cohort = 0;
  for (let offset = -window; offset <= window; offset++) {
    const values = cohorts.get(age + offset);
    if (!values) continue;
    cohort += values.length;
    score += (bound(values, papers, false) + bound(values, papers, true)) / 2;
  }
  return { percentile: cohort ? Math.round(score * 100 / cohort) : null, cohort };
}

export function candidates(model, results, search) {
  const term = search.term.toLocaleLowerCase();
  const rows = [];
  for (const person of model.people) {
    const stat = results.stats.get(person.name);
    if (!stat || stat.papers < search.minPapers) continue;
    if (search.scope === "kr" && person.role !== "KR faculty") continue;
    if (search.scope === "world" && !person.listed_faculty) continue;
    if (search.scope === "korean" && !person.is_korean) continue;
    if (search.affiliation && person.affiliation !== search.affiliation) continue;
    if (search.role && roleLabel(person) !== search.role) continue;
    if (search.location === "kr" && person.country !== "kr") continue;
    if (search.location === "abroad" && (!person.country || person.country === "kr")) continue;
    if (search.confirmed && (!person.age_source || person.age_source.startsWith("est"))) continue;
    if (search.ageMin != null && (person.academic_age == null || person.academic_age < search.ageMin)) continue;
    if (search.ageMax != null && (person.academic_age == null || person.academic_age > search.ageMax)) continue;
    if (term && !`${person.name} ${person.affiliation ?? ""}`.toLocaleLowerCase().includes(term)) continue;
    const scores = percentile(results.cohorts, person.academic_age, stat.papers, search.window);
    rows.push({ ...person, ...stat, ...scores, age: person.birth_year == null ? null : model.referenceYear - person.birth_year });
  }
  return rows.sort((a, b) => (b[search.sort] ?? -1) - (a[search.sort] ?? -1) ||
    b.papers - a.papers || compareText(a.name, b.name)).map((row, index) => ({ ...row, rank: index + 1 }));
}

export function series(model, name, filter, wholeCareer = false) {
  const allowed = venueFilter(model, filter);
  const byYear = new Map();
  const byArea = new Map();
  for (const [, venue, year, papers] of model.authorByName.get(name) ?? []) {
    if (!allowed.has(venue) || (!wholeCareer && !inWindow(year, filter))) continue;
    if (!filter.expanded && model.venues.get(venue).next_tier) continue;
    addTo(byYear, year, papers);
    addTo(byArea, model.venues.get(venue).area_title, papers);
  }
  return { byYear, byArea };
}
