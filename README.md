# FacultyPerformance Pages

GitHub Pages에서 원본 DB의 조회용 스냅샷을 브라우저로 엽니다. 국내 기관, 한국인 연구자, 학교 비교, 교수·후보자 검색과 근거, 교수 비교, 데이터 현황을 볼 수 있습니다. 기간·분야·학회 필터와 검색은 브라우저에서 실행됩니다. 데이터는 내보낸 시점 기준이며, 차트 표현과 일부 선택 조작은 Streamlit 화면과 다릅니다.

## 원본 Mac에서 스냅샷 갱신

FacultyPerformance 폴더에 `data/public.duckdb`, `data/pii.duckdb`, `src/fp/`와 원본 Python 환경이 필요합니다. 원본 앱이나 데이터 갱신 작업을 닫은 뒤 이 저장소의 `export_pages_snapshot.py`를 내려받아 FacultyPerformance 폴더에서 실행합니다.

```sh
uv pip install --python .venv/bin/python 'cryptography>=42'
.venv/bin/python ~/Downloads/export_pages_snapshot.py
```

원본 Mac에서는 기존 Keychain 키를 사용합니다. `~/.config/faculty-performance/pii.key`에 키를 보관하는 환경에서는 파일 권한을 `600`으로 설정합니다. 기존 키를 화면에 표시하지 않고 입력하려면 마지막 명령에 `--ask-db-key`를 붙입니다. 이미 내보낸 폴더가 있으면 `--output-dir faculty-pages-export-new`처럼 새 출력 폴더를 지정합니다.

- `faculty-pages-export/faculty-performance.snapshot`은 GitHub Pages에 올리는 암호화 파일입니다. 배포 담당자에게 이 파일을 보냅니다.
- `faculty-pages-export/faculty-performance.share-link.txt`에는 스냅샷 전용 열람 키가 들어 있는 링크가 있습니다. 열람을 허용한 사람에게만 별도 채널로 공유합니다. 이 파일과 원본 DB 키는 로컬에 보관합니다.

배포 담당자는 암호화 파일을 이 저장소 루트의 `faculty-performance.snapshot`으로 교체합니다. 스냅샷을 새로 만들 때마다 열람 링크가 바뀝니다. 이전 스냅샷을 이미 복사한 사람의 접근은 회수할 수 없습니다.
