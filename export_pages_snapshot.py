#!/usr/bin/env python3
"""Export a read-only FacultyPerformance snapshot for the GitHub Pages viewer."""

from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import sys
from datetime import date, datetime, timezone
from getpass import getpass
from pathlib import Path

SNAPSHOT = "faculty-performance.json.gz"
MAX_SNAPSHOT_BYTES = 95 * 1024 * 1024


def json_default(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Unsupported snapshot value: {type(value).__name__}")


def write_json(stream, value):
    stream.write(json.dumps(
        value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), default=json_default,
    ).encode("utf-8"))


def write_table(stream, con, query):
    result = con.execute(query)
    stream.write(b'{"columns":')
    write_json(stream, [column[0] for column in result.description])
    stream.write(b',"rows":[')
    separator = b""
    while rows := result.fetchmany(8192):
        for row in rows:
            stream.write(separator)
            write_json(stream, row)
            separator = b","
    stream.write(b"]}")


def queries(con, boards):
    boards.ensure_pinst(con)
    has_author_pub = con.execute("SELECT EXISTS (SELECT 1 FROM author_pub)").fetchone()[0]
    author_source = "author_pub" if has_author_pub else (
        "(SELECT name, venue, year, count, 0 AS first_count, 0 AS last_count FROM cs_pub)"
    )
    has_citations = con.execute(
        "SELECT EXISTS (SELECT 1 FROM duckdb_tables() WHERE table_name = 'oa_cites')"
    ).fetchone()[0]
    citation_column = "c.cited_by" if has_citations else "NULL::INTEGER"
    citation_join = "LEFT JOIN oa_cites c ON c.doi = p.doi" if has_citations else ""
    return {
        "venues": f"""SELECT v.venue, v.area, v.area_title, {boards.field_sql("v")} AS field,
                      v.next_tier FROM venue v ORDER BY v.venue""",
        "schools": """SELECT institution, country FROM institution ORDER BY institution""",
        "people": """
            WITH fac AS (
                SELECT name, any_value(homepage) AS homepage, any_value(scholarid) AS scholarid
                FROM cs_faculty GROUP BY name
            ), cmap AS (SELECT country, any_value(region) AS region FROM institution GROUP BY 1)
            SELECT r.person AS name, r.affiliation, r.country, r.role, r.affil_year, r.is_korean,
                r.listed_faculty, s.stage, a.academic_age, a.phd_year, a.phd_year_eff, a.age_source,
                a.birth_year, a.birth_source, a.first_top_year,
                pc.cites AS cites_all, pc.cited_papers, pc.papers AS top_papers,
                fac.homepage, fac.scholarid,
                CASE WHEN r.country = 'kr' THEN 'Korea' WHEN r.country = 'us' THEN 'United States'
                     WHEN r.country = 'cn' THEN 'China' WHEN cm.region = 'europe' THEN 'Europe'
                     WHEN cm.region = 'asia' THEN 'Rest of Asia' WHEN r.country IS NOT NULL THEN 'Other' END AS region
            FROM person_role r LEFT JOIN person_age a USING (person)
            LEFT JOIN person_stage s USING (person) LEFT JOIN person_cites pc USING (person)
            LEFT JOIN fac ON fac.name = r.person LEFT JOIN cmap cm ON cm.country = r.country
            ORDER BY r.person
        """,
        "degrees": """SELECT person, degree, year, institution, source, evidence
            FROM pii.degree WHERE person IN (SELECT person FROM person_role)
            ORDER BY person, degree, year""",
        "authors": f"""SELECT a.name, a.venue, a.year, sum(a.count) AS papers,
            sum(a.first_count) AS first_author, sum(a.last_count) AS last_author
            FROM {author_source} a JOIN venue v USING (venue)
            WHERE a.name IN (SELECT person FROM person_role)
            GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""",
        "papers": f"""SELECT a.name, p.venue, p.year, p.title, a.pos, p.n_authors,
            {citation_column} AS cites, p.doi
            FROM dblp_authorship a JOIN dblp_paper p USING (key) JOIN venue v USING (venue)
            {citation_join} WHERE a.name IN (SELECT person FROM person_role)
            ORDER BY a.name, p.year DESC, p.title""",
        "institutionPapers": """SELECT institution, venue, year, count(DISTINCT key) AS papers
            FROM pinst GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""",
        "institutionFaculty": """SELECT institution, name, venue, year, count(DISTINCT key) AS papers
            FROM pinst GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4""",
        "schoolComparison": """SELECT p.dept, p.name, p.venue, p.year, sum(p.count) AS papers
            FROM cs_pub p JOIN institution i ON i.institution = p.dept JOIN venue v USING (venue)
            GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4""",
        "collaboration": """
            WITH k AS (SELECT DISTINCT key, institution, venue, year FROM pinst WHERE country = 'kr')
            SELECT a.institution AS school_a, b.institution AS school_b, a.venue, a.year, count(*) AS papers
            FROM k a JOIN k b ON a.key = b.key AND a.institution < b.institution
            GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4
        """,
        "mobility": None,
        "snapshots": "SELECT source, version, fetched_at FROM snapshot ORDER BY fetched_at DESC",
        "coverage": """SELECT coalesce(a.age_source, 'none') AS source, count(*) AS faculty
            FROM person_age a JOIN institution i ON i.institution = a.affiliation
            WHERE i.country = 'kr' GROUP BY 1 ORDER BY 2 DESC""",
        "logs": """SELECT source, status, count(*) AS n, max(fetched_at) AS last
            FROM pii.fetch_log GROUP BY ALL ORDER BY ALL""",
    }


def compress_snapshot(con, boards, year):
    payload = io.BytesIO()
    with gzip.GzipFile(fileobj=payload, mode="wb", compresslevel=5, mtime=0) as stream:
        metadata = {
            "version": 1,
            "exportedAt": datetime.now(timezone.utc).isoformat(),
            "referenceYear": year,
            "fields": [[code, title, group] for code, (title, group, _) in boards.FIELDS.items()],
        }
        stream.write(b"{")
        for key, value in metadata.items():
            write_json(stream, key)
            stream.write(b":")
            write_json(stream, value)
            stream.write(b",")
        stream.write(b'"tables":{')
        for index, (name, query) in enumerate(queries(con, boards).items()):
            if index:
                stream.write(b",")
            write_json(stream, name)
            stream.write(b":")
            if name == "mobility":
                flows = boards.mobility(con).groupby(["start_grp", "now_grp"], dropna=True).size()
                write_json(stream, {
                    "columns": ["start_grp", "now_grp", "people"],
                    "rows": [[start, end, int(count)] for (start, end), count in flows.items()],
                })
            else:
                write_table(stream, con, query)
        stream.write(b"}}")
    return payload.getvalue()


def save_snapshot(payload, directory):
    if len(payload) > MAX_SNAPSHOT_BYTES:
        raise ValueError("압축 스냅샷이 GitHub 업로드용 95 MiB 한도를 초과했습니다.")
    directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    path = directory / SNAPSHOT
    try:
        with path.open("xb") as output:
            output.write(payload)
    except BaseException:
        path.unlink(missing_ok=True)
        directory.rmdir()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path.cwd(), help="FacultyPerformance project root")
    parser.add_argument("--output-dir", type=Path, default=Path("faculty-pages-export"), help="new output directory")
    key_mode = parser.add_mutually_exclusive_group()
    key_mode.add_argument("--ask-db-key", action="store_true", help="read the original DB key from a hidden prompt")
    key_mode.add_argument("--db-key-file", type=Path, help="read an existing owner-only key file")
    args = parser.parse_args()
    root = args.project.resolve()
    if any(not (root / "data" / name).is_file() for name in ("public.duckdb", "pii.duckdb")):
        parser.exit(1, "FacultyPerformance 폴더에서 실행하세요. data/에 두 DuckDB 파일이 필요합니다.\n")
    if args.output_dir.exists():
        parser.exit(1, "출력 폴더가 이미 있습니다. --output-dir에 새 폴더 이름을 지정하세요.\n")

    try:
        os.environ["FP_ROOT"] = str(root)
        sys.path.insert(0, str(root / "src"))
        from fp import age, boards, pii
    except ImportError:
        parser.exit(1, "원본 .venv의 Python을 사용하세요.\n")

    default_key_file = Path.home() / ".config/faculty-performance/pii.key"
    try:
        if args.ask_db_key:
            os.environ["FP_PII_KEY"] = getpass("원본 DB 복호화 키: ").strip()
        elif key_file := args.db_key_file or (
            default_key_file if not os.environ.get("FP_PII_KEY") and default_key_file.is_file() else None
        ):
            if key_file.stat().st_mode & 0o077:
                parser.exit(1, "키 파일 권한을 chmod 600으로 설정하세요.\n")
            os.environ["FP_PII_KEY"] = key_file.read_text(encoding="utf-8").strip()
        con = pii.connect(read_only=True)
    except (Exception, KeyboardInterrupt):
        parser.exit(1, "원본 DB를 열 수 없습니다. 기존 키와 DB 파일을 확인하고 원본 앱을 종료한 뒤 다시 실행하세요.\n")

    try:
        year = date.today().year
        age.create_views(con, year)
        payload = compress_snapshot(con, boards, year)
        save_snapshot(payload, args.output_dir)
    except (OSError, ValueError) as error:
        parser.exit(1, f"스냅샷을 저장할 수 없습니다. {error}\n")
    except Exception as error:
        parser.exit(1, f"스냅샷 생성에 실패했습니다. 원본 프로젝트 버전과 DB를 확인하세요 ({type(error).__name__}).\n")
    finally:
        con.close()
    print(f"배포 파일: {args.output_dir / SNAPSHOT}")


if __name__ == "__main__":
    main()
